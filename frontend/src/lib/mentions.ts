// @mention helpers for the task-panel comment box
// (docs/archive/plans/collaboration-and-sharing.md, C5c). Pure string logic:
// the picker's query, inserting a picked name, deriving the ids to send, and
// splitting a stored comment into text and mention pieces for rendering.
//
// Usernames are free text (up to 50 chars), so a mention is matched by the
// literal `@username` of a KNOWN user — never by a generic `@word` pattern —
// with the longest name first so `@ana.b` is not read as `@ana`.

export interface MentionUser {
  id: number;
  username: string;
  /** False for a deactivated account; absent means active or not known to be otherwise. */
  active?: boolean;
}

/** The most ids one comment may carry (the server's limit). */
export const MAX_MENTIONS = 20;

const NAME_CHAR = /[\p{L}\p{N}_-]/u;
/** A char that, right before `@`, means the `@` is part of a word (an email, `a@b`). */
const WORD_BEFORE = /[\p{L}\p{N}_.-]/u;

export interface MentionQuery {
  /** Index of the `@` in the text. */
  start: number;
  /** Text typed after the `@`, up to the caret. */
  query: string;
}

/**
 * The `@query` being typed at `caret`, or null. The `@` must start the text or
 * follow whitespace, and no whitespace may sit between it and the caret.
 */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const upto = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

/** Candidates whose name starts with the query, then those containing it; case-insensitive. */
export function filterMentionCandidates<T extends MentionUser>(
  candidates: readonly T[],
  query: string,
  limit = 6,
): T[] {
  const q = query.toLowerCase();
  const starts: T[] = [];
  const contains: T[] = [];
  for (const c of candidates) {
    const name = c.username.toLowerCase();
    if (name.startsWith(q)) starts.push(c);
    else if (q !== "" && name.includes(q)) contains.push(c);
  }
  const byName = (a: T, b: T) => a.username.localeCompare(b.username);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** Replaces the typed `@query` (start .. caret) with `@username ` and returns the new caret. */
export function insertMention(
  text: string,
  q: MentionQuery,
  caret: number,
  username: string,
): { text: string; caret: number } {
  const insert = `@${username} `;
  return {
    text: text.slice(0, q.start) + insert + text.slice(caret),
    caret: q.start + insert.length,
  };
}

export interface MentionMatch {
  start: number;
  end: number;
  user: MentionUser;
}

/** Whether `@name` at `start` is a whole token: not glued to a word before or after it. */
function isTokenAt(text: string, start: number, end: number): boolean {
  if (start > 0 && WORD_BEFORE.test(text[start - 1])) return false;
  const next = text[end];
  if (next === undefined) return true;
  if (NAME_CHAR.test(next)) return false;
  // "@ana." at a sentence end is fine; "@ana.smith" is a longer name.
  if (next === "." && end + 1 < text.length && NAME_CHAR.test(text[end + 1])) return false;
  return true;
}

/** Every `@username` of a known user in `text`, left to right, non-overlapping. */
export function findMentions(text: string, users: readonly MentionUser[]): MentionMatch[] {
  const byLength = [...users]
    .filter((u) => u.username !== "")
    .sort((a, b) => b.username.length - a.username.length);
  const out: MentionMatch[] = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) break;
    let hit: MentionMatch | null = null;
    for (const user of byLength) {
      const end = at + 1 + user.username.length;
      if (text.startsWith(user.username, at + 1) && isTokenAt(text, at, end)) {
        hit = { start: at, end, user };
        break;
      }
    }
    if (hit) {
      out.push(hit);
      i = hit.end;
    } else {
      i = at + 1;
    }
  }
  return out;
}

/**
 * The ids to send with a comment: recorded picks whose `@username` is still in
 * `body`. Deleting the text of a mention drops its id; typing `@name` by hand
 * without picking it does not add one.
 */
export function deriveMentionedIds(body: string, recorded: readonly MentionUser[]): number[] {
  const ids: number[] = [];
  for (const m of findMentions(body, recorded)) {
    if (!ids.includes(m.user.id)) ids.push(m.user.id);
  }
  return ids.slice(0, MAX_MENTIONS);
}

export type CommentPiece =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; userId: number; inactive?: true };

/**
 * Splits a stored comment body into plain text and mention pieces. Only
 * `@username` tokens of users whose id is in `mentionedUserIds` become
 * mentions; every other `@text` stays plain.
 */
export function splitComment(
  body: string,
  mentionedUserIds: readonly number[] | null | undefined,
  users: readonly MentionUser[],
): CommentPiece[] {
  const ids = new Set(mentionedUserIds ?? []);
  const known = ids.size === 0 ? [] : users.filter((u) => ids.has(u.id));
  const pieces: CommentPiece[] = [];
  let cursor = 0;
  for (const m of findMentions(body, known)) {
    if (m.start > cursor) pieces.push({ kind: "text", text: body.slice(cursor, m.start) });
    pieces.push({
      kind: "mention",
      text: body.slice(m.start, m.end),
      userId: m.user.id,
      ...(m.user.active === false ? { inactive: true as const } : {}),
    });
    cursor = m.end;
  }
  if (cursor < body.length) pieces.push({ kind: "text", text: body.slice(cursor) });
  return pieces.length ? pieces : [{ kind: "text", text: body }];
}

/** The fields of a user the candidate lists read (a `UserSummary` satisfies it). */
export interface DirectoryUser extends MentionUser {
  active: boolean;
  pipelineAccess: boolean;
}

function uniqueById<T extends MentionUser>(people: readonly (T | null | undefined)[]): T[] {
  const byId = new Map<number, T>();
  for (const p of people) if (p && !byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()];
}

/**
 * Who a task comment can mention: the project's TAM, Solution Architect and
 * members, plus the owner (TAM) of the project's customer.
 * `directory` (the user list) resolves the customer owner and filters out
 * inactive accounts; while it is still loading nobody is dropped. `known` is
 * the wider set chips render from (everyone in the directory plus the project's
 * own people), so a mentioned user who was deactivated since still shows a chip.
 */
export function taskMentionPeople(input: {
  tam: MentionUser | null | undefined;
  sa: MentionUser | null | undefined;
  members: readonly MentionUser[];
  customerOwnerId: number | null | undefined;
  directory: readonly DirectoryUser[] | undefined;
}): { candidates: MentionUser[]; known: MentionUser[] } {
  const { tam, sa, members, customerOwnerId, directory } = input;
  const owner =
    customerOwnerId != null ? (directory?.find((u) => u.id === customerOwnerId) ?? null) : null;
  const project = uniqueById<MentionUser>([
    tam ? { id: tam.id, username: tam.username } : null,
    sa ? { id: sa.id, username: sa.username } : null,
    ...members.map((m) => ({ id: m.id, username: m.username })),
    owner ? { id: owner.id, username: owner.username } : null,
  ]);
  const activeIds = directory ? new Set(directory.filter((u) => u.active).map((u) => u.id)) : null;
  const candidates = activeIds ? project.filter((p) => activeIds.has(p.id)) : project;
  // Chips keep resolving a deactivated user (history) but flag them so the
  // chip can render muted.
  const withActive = (p: MentionUser): MentionUser => {
    const entry = directory?.find((u) => u.id === p.id);
    return entry && !entry.active ? { ...p, active: false } : p;
  };
  const known = uniqueById<MentionUser>([
    ...project,
    ...(directory ?? []).map((u) => ({ id: u.id, username: u.username })),
  ]).map(withActive);
  return { candidates, known };
}

/**
 * Who a deal note can mention: active users who can open the
 * Pipeline - the `pipeline:view` permission or the `*` wildcard - since a
 * mention is only useful to someone who can follow the link.
 */
export function dealMentionCandidates(directory: readonly DirectoryUser[] | undefined): DirectoryUser[] {
  return (directory ?? []).filter((u) => u.active && u.pipelineAccess);
}
