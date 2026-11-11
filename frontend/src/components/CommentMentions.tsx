import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import {
  activeMentionQuery,
  deriveMentionedIds,
  filterMentionCandidates,
  insertMention,
  splitComment,
  type MentionUser,
} from "@/lib/mentions";
import { FIELD_FOCUS, FIELD_FOCUS_WITHIN } from "@/lib/utils";

/**
 * Comment text with the stored mentions shown as name chips
 * (docs/archive/plans/collaboration-and-sharing.md, C5c). Only `@username`
 * tokens of users in `mentionedUserIds` become chips; everything else is plain
 * text. Rendered as React text nodes only, so a body can never inject HTML.
 */
export function CommentBody({
  body,
  mentionedUserIds,
  users,
  className = "text-xs",
}: {
  body: string;
  mentionedUserIds: readonly number[] | undefined;
  users: readonly MentionUser[];
  className?: string;
}) {
  const pieces = useMemo(() => splitComment(body, mentionedUserIds, users), [body, mentionedUserIds, users]);
  return (
    <p className={`whitespace-pre-wrap wrap-break-word text-on-surface ${className}`}>
      {pieces.map((piece, i) =>
        piece.kind === "mention" ? (
          <span
            key={i}
            data-testid="mention-chip"
            className="rounded-sm bg-primary/10 px-1 py-px font-semibold text-primary"
          >
            {piece.text}
          </span>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </p>
  );
}

/**
 * The comment box: a single-line input whose `@` opens a picker of the
 * candidate people. It is an ARIA combobox — the field owns focus and points
 * at the listbox with `aria-controls` / `aria-activedescendant`.
 *
 * `variant="note"` is the Pipeline deal-note box: the same picker over a
 * three-row textarea with a labelled "Add note" button below it.
 */
export function CommentComposer({
  candidates,
  isPending,
  error,
  onSend,
  variant = "comment",
}: {
  candidates: readonly MentionUser[];
  isPending: boolean;
  error: string | null;
  onSend: (body: string, mentionedUserIds: number[]) => Promise<void>;
  variant?: "comment" | "note";
}) {
  const isNote = variant === "note";
  const listId = useId();
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  // `@` index the user dismissed with Escape; the picker stays shut until the
  // query moves to a different `@`.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  // Every name picked from the list. The ids sent are derived from which of
  // these are still in the text, so deleting a mention drops its id.
  const [recorded, setRecorded] = useState<MentionUser[]>([]);
  const pendingCaret = useRef<number | null>(null);

  const query = activeMentionQuery(body, caret);
  const matches = useMemo(
    () => (query ? filterMentionCandidates(candidates, query.query) : []),
    [candidates, query],
  );
  const open = query !== null && query.start !== dismissedAt && matches.length > 0;
  const active = Math.min(highlight, Math.max(0, matches.length - 1));

  // Put the caret after an inserted mention once React has written the value.
  useEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos, pos);
      setCaret(pos);
    }
  }, [body]);

  function pick(user: MentionUser) {
    if (!query) return;
    const next = insertMention(body, query, caret, user.username);
    pendingCaret.current = next.caret;
    setBody(next.text);
    setRecorded((r) => (r.some((u) => u.id === user.id) ? r : [...r, user]));
    setHighlight(0);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // Enter/Tab/arrows during IME composition belong to the IME, not the picker.
    if (!open || e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((active + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((active - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      // Closes the picker only, not the task panel behind it.
      e.preventDefault();
      e.stopPropagation();
      setDismissedAt(query?.start ?? null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isPending) return;
    try {
      await onSend(trimmed, deriveMentionedIds(trimmed, recorded));
      setBody("");
      setRecorded([]);
      setCaret(0);
    } catch {
      // surfaced through `error`
    }
  }

  const fieldProps = {
    ref: inputRef,
    role: "combobox",
    "aria-label": isNote ? "Add a note" : "Write a comment",
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open ? `${listId}-${active}` : undefined,
    value: body,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setBody(e.target.value);
      setCaret(e.target.selectionStart ?? e.target.value.length);
      // Starting over (no `@query` left) re-arms a picker Escape closed.
      if (!activeMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length)) {
        setDismissedAt(null);
      }
      setHighlight(0);
    },
    onSelect: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCaret(e.currentTarget.selectionStart ?? 0),
    onKeyDown: handleKeyDown,
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={
          isNote
            ? "relative space-y-2 border-t border-outline-variant pt-3"
            : `relative flex items-center gap-2 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 ${FIELD_FOCUS_WITHIN}`
        }
      >
        {isNote ? (
          <textarea
            {...fieldProps}
            rows={3}
            maxLength={2000}
            placeholder="Add a note…"
            className={`w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant ${FIELD_FOCUS}`}
          />
        ) : (
          <input
            {...fieldProps}
            type="text"
            maxLength={5000}
            placeholder="Write a comment…"
            className="min-w-0 flex-1 border-none bg-transparent text-xs text-on-surface outline-hidden placeholder:text-on-surface-variant/60 focus:outline-hidden"
          />
        )}
        {isNote ? (
          <div className="flex items-center justify-between gap-2">
            {error ? <p role="alert" className="text-xs text-error">{error}</p> : <span />}
            <button
              type="submit"
              disabled={isPending || !body.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                send
              </span>
              {isPending ? "Adding…" : "Add note"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={isPending || !body.trim()}
            aria-label="Send comment"
            className="flex shrink-0 items-center text-primary disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[17px]">send</span>
          </button>
        )}

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Mention someone"
            className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-48 overflow-y-auto rounded-sm border border-outline-variant bg-surface-container-lowest py-1 shadow-overlay"
          >
            {matches.map((user, i) => (
              <li
                key={user.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: the input must keep focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(user);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer truncate px-3 py-1.5 text-xs text-on-surface ${
                  i === active ? "bg-surface-container-high" : ""
                }`}
              >
                <span className="text-on-surface-variant">@</span>
                {user.username}
              </li>
            ))}
          </ul>
        )}
      </form>
      {error && !isNote && (
        <p role="alert" className="text-meta text-error">
          {error}
        </p>
      )}
    </>
  );
}
