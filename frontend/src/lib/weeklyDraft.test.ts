import { describe, expect, it } from "vitest";
import { draftWeeklyHighlights, draftWeeklyUpdate, splitTitle } from "./weeklyDraft";
import type {
  DailyReviewCustomer,
  DailyReviewNote,
  DailyReviewOpsNote,
  DailyReviewProject,
} from "./queries";

// A full ISO week (Mon..Sun) matching backend/test/isoWeek.test.ts and
// isoWeek.test.ts's shared "2026-W35" fixture — Mon 24 ... Sun 30.
const WEEK = {
  days: [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
  ],
};

const AUTHOR = { id: 1, username: "alice" };

// `noteDate` is built as a full ISO instant ("2026-08-24T00:00:00.000Z"),
// matching what the API actually returns for every `@db.Date` column (see
// backend/test/projectReviews.test.ts) — this is the shape every test below
// exercises by default. `weeklyDraft.ts`'s `groupNotesByDay` reads the
// calendar day out of it via `dayFromIso`; see the one bare-day-string case
// near the bottom of this file proving that shape also still works.
function note(id: number, day: string, body: string): DailyReviewNote {
  return {
    id,
    noteDate: `${day}T00:00:00.000Z`,
    body,
    author: AUTHOR,
    updatedAt: `${day}T12:00:00.000Z`,
  };
}

function opsNote(id: number, day: string, body: string, title: string): DailyReviewOpsNote {
  return {
    ...note(id, day, body),
    title,
  };
}

function project(id: number, name: string, notes: DailyReviewNote[]): DailyReviewProject {
  return {
    id,
    name,
    status: "ACTIVE",
    customerId: 1,
    baselineLockedAt: null,
    phase: "—",
    progress: { done: 0, total: 0 },
    slipDays: null,
    overdueTasks: [],
    openRisks: [],
    notes,
    reviews: [],
  };
}

function customer(
  projects: DailyReviewProject[],
  operationsNotes: DailyReviewOpsNote[] = [],
): DailyReviewCustomer {
  return {
    id: 1,
    name: "Acme",
    tam: { id: 1, username: "alice" },
    projects,
    operationsNotes,
    weeklyUpdate: null,
    previousWeeklyUpdate: null,
  };
}

describe("draftWeeklyUpdate", () => {
  it("drafts one paragraph per project plus an Operations paragraph, separated by blank lines", () => {
    const projectA = project(1, "Project A", [
      note(1, "2026-08-24", "Kickoff done"),
      note(2, "2026-08-25", "Scope review"),
    ]);
    const projectB = project(2, "Project B", [note(3, "2026-08-24", "Blocked on vendor")]);
    const ops = [opsNote(10, "2026-08-26", "Circuit flapping", "SD-WAN")];

    const result = draftWeeklyUpdate(customer([projectA, projectB], ops), WEEK);

    expect(result).toBe(
      [
        "Project A — Mon 24: Kickoff done · Tue 25: Scope review",
        "Project B — Mon 24: Blocked on vendor",
        "Operations — Wed 26 [SD-WAN]: Circuit flapping",
      ].join("\n\n"),
    );
  });

  it("skips a project with zero notes this week entirely (no paragraph, no stray blank line)", () => {
    const withNotes = project(1, "Project A", [note(1, "2026-08-24", "Kickoff done")]);
    const noNotes = project(2, "Project C", []);

    const result = draftWeeklyUpdate(customer([withNotes, noNotes]), WEEK);

    expect(result).toBe("Project A — Mon 24: Kickoff done");
    expect(result).not.toContain("Project C");
  });

  it("joins same-day multiple notes with \" / \", in noteDate/id order", () => {
    const p = project(1, "Project A", [
      note(1, "2026-08-24", "Note one"),
      note(2, "2026-08-24", "Note two"),
    ]);

    const result = draftWeeklyUpdate(customer([p]), WEEK);

    expect(result).toBe("Project A — Mon 24: Note one / Note two");
  });

  it("days without a note are skipped, only noted days appear as rows", () => {
    const p = project(1, "Project A", [
      note(1, "2026-08-24", "Mon note"),
      note(2, "2026-08-30", "Sun note"),
    ]);

    const result = draftWeeklyUpdate(customer([p]), WEEK);

    expect(result).toBe("Project A — Mon 24: Mon note · Sun 30: Sun note");
  });

  describe("Operations bracket (single note per day, title is required)", () => {
    it("title -> [<title>]", () => {
      const ops = [opsNote(1, "2026-08-24", "Maintenance window", "SD-WAN")];
      const result = draftWeeklyUpdate(customer([], ops), WEEK);
      expect(result).toBe("Operations — Mon 24 [SD-WAN]: Maintenance window");
    });
  });

  it("two operations notes sharing a day: the bracket moves onto each note's own body, joined with \" / \"", () => {
    const ops = [
      opsNote(1, "2026-08-24", "Circuit flapping", "SD-WAN"),
      opsNote(2, "2026-08-24", "Rule updated", "Firewall"),
    ];
    const result = draftWeeklyUpdate(customer([], ops), WEEK);
    expect(result).toBe(
      "Operations — Mon 24: [SD-WAN] Circuit flapping / [Firewall] Rule updated",
    );
  });

  it("three operations notes sharing a day, each keeps its own title bracket", () => {
    const ops = [
      opsNote(1, "2026-08-24", "Circuit flapping", "SD-WAN"),
      opsNote(2, "2026-08-24", "General update", "Status check"),
      opsNote(3, "2026-08-24", "Ticket opened", "Firewall"),
    ];
    const result = draftWeeklyUpdate(customer([], ops), WEEK);
    expect(result).toBe(
      "Operations — Mon 24: [SD-WAN] Circuit flapping / [Status check] General update / [Firewall] Ticket opened",
    );
  });

  it("empty customer (no projects, no operations notes) drafts to an empty string — no trailing stub", () => {
    const result = draftWeeklyUpdate(customer([]), WEEK);
    expect(result).toBe("");
  });

  it("a project with only an empty projects array and no operations notes also drafts to an empty string", () => {
    const empty = project(1, "Project A", []);
    const result = draftWeeklyUpdate(customer([empty]), WEEK);
    expect(result).toBe("");
  });

  it("keeps multi-line note bodies verbatim, internal newlines untouched", () => {
    const body = "Line one\nLine two\n\nLine four";
    const p = project(1, "Project A", [note(1, "2026-08-24", body)]);

    const result = draftWeeklyUpdate(customer([p]), WEEK);

    expect(result).toBe(`Project A — Mon 24: ${body}`);
    expect(result).toContain(body);
  });

  describe("opts.throughDay (D11 — Mid-week's Highlight drafts Mon-Wed only)", () => {
    it("keeps notes on the boundary day and drops any note after it, for project and operations notes alike", () => {
      const p = project(1, "Project A", [
        note(1, "2026-08-24", "Mon note"),
        note(2, "2026-08-26", "Wed note"),
        note(3, "2026-08-27", "Thu note"),
      ]);
      const ops = [
        opsNote(10, "2026-08-26", "Wed ops", "SD-WAN"),
        opsNote(11, "2026-08-28", "Fri ops", "Firewall"),
      ];

      const result = draftWeeklyUpdate(customer([p], ops), WEEK, { throughDay: "2026-08-26" });

      expect(result).toBe(
        [
          "Project A — Mon 24: Mon note · Wed 26: Wed note",
          "Operations — Wed 26 [SD-WAN]: Wed ops",
        ].join("\n\n"),
      );
      expect(result).not.toContain("Thu note");
      expect(result).not.toContain("Fri ops");
    });

    it("drops the Operations paragraph entirely when every operations note falls after throughDay", () => {
      const p = project(1, "Project A", [note(1, "2026-08-24", "Mon note")]);
      const ops = [opsNote(10, "2026-08-28", "Fri ops", "Firewall")];

      const result = draftWeeklyUpdate(customer([p], ops), WEEK, { throughDay: "2026-08-26" });

      expect(result).toBe("Project A — Mon 24: Mon note");
      expect(result).not.toContain("Operations");
    });

    it("omitting throughDay (or passing opts with none) still drafts every day, weekend notes included", () => {
      const p = project(1, "Project A", [
        note(1, "2026-08-24", "Mon note"),
        note(2, "2026-08-30", "Sun note"),
      ]);
      const ops = [opsNote(10, "2026-08-29", "Sat ops", "SD-WAN")];

      const expected = [
        "Project A — Mon 24: Mon note · Sun 30: Sun note",
        "Operations — Sat 29 [SD-WAN]: Sat ops",
      ].join("\n\n");

      expect(draftWeeklyUpdate(customer([p], ops), WEEK)).toBe(expected);
      expect(draftWeeklyUpdate(customer([p], ops), WEEK, {})).toBe(expected);
    });
  });

  it("a bare 'yyyy-MM-dd' noteDate (not an ISO instant) still groups and labels correctly", () => {
    // `dayFromIso` reads only the first 10 characters, so a bare day string
    // slices back to itself unchanged — proving the grouping logic doesn't
    // depend on the ISO-instant suffix being present.
    const bareDateNote: DailyReviewNote = {
      id: 1,
      noteDate: "2026-08-24",
      body: "Kickoff done",
      author: AUTHOR,
      updatedAt: "2026-08-24T12:00:00.000Z",
    };
    const p = project(1, "Project A", [bareDateNote]);

    const result = draftWeeklyUpdate(customer([p]), WEEK);

    expect(result).toBe("Project A — Mon 24: Kickoff done");
  });
});

describe("splitTitle", () => {
  it("takes the first line as the title and the rest, trimmed, as detail", () => {
    expect(splitTitle("Line one\nLine two\nLine three")).toEqual({
      title: "Line one",
      detail: "Line two\nLine three",
    });
  });

  it("a single-line body has a null detail", () => {
    expect(splitTitle("Just one line")).toEqual({ title: "Just one line", detail: null });
  });

  it("cuts a first line over 200 characters at 200 and puts the full trimmed text in detail", () => {
    const longLine = "x".repeat(210);
    const body = `${longLine}\nmore text`;

    const { title, detail } = splitTitle(body);

    expect(title).toBe(longLine.slice(0, 200));
    expect(title.length).toBe(200);
    expect(detail).toBe(body);
  });

  it("normalises \\r\\n line endings to \\n throughout, in both title and detail", () => {
    expect(splitTitle("Title line\r\nRest one\r\nRest two")).toEqual({
      title: "Title line",
      detail: "Rest one\nRest two",
    });
  });

  it("normalises a lone \\r (not followed by \\n) to a line break too", () => {
    // A lone \r previously survived into the title untouched, which the
    // backend's title validation (no \r or \n) then rejected outright.
    expect(splitTitle("alpha\rbeta")).toEqual({ title: "alpha", detail: "beta" });
  });

  it("cuts a title at 200 code points, not UTF-16 units, so a multi-byte character straddling the boundary survives whole", () => {
    // "😀" is a surrogate pair (2 UTF-16 units, 1 code point) — a naive
    // `.slice(0, 200)` landing mid-pair would produce an unpaired surrogate.
    const body = `${"x".repeat(199)}😀y`; // 201 code points total
    const { title, detail } = splitTitle(body);
    expect(title).toBe(`${"x".repeat(199)}😀`);
    expect([...title]).toHaveLength(200);
    expect(detail).toBe(body);
  });
});

describe("draftWeeklyHighlights", () => {
  it("drafts one highlight per note, in day order", () => {
    const p = project(1, "Project A", [
      note(1, "2026-08-24", "Kickoff done"),
      note(2, "2026-08-25", "Scope review"),
    ]);

    const result = draftWeeklyHighlights(customer([p]), WEEK);

    expect(result).toEqual([
      { title: "Mon 24 Project A: Kickoff done", detail: null },
      { title: "Tue 25 Project A: Scope review", detail: null },
    ]);
  });

  it("two notes on the same day in the same project become two rows, in id order — never joined with \" / \" like draftWeeklyUpdate", () => {
    const p = project(1, "Project A", [
      note(1, "2026-08-24", "First"),
      note(2, "2026-08-24", "Second"),
    ]);

    const result = draftWeeklyHighlights(customer([p]), WEEK);

    expect(result).toEqual([
      { title: "Mon 24 Project A: First", detail: null },
      { title: "Mon 24 Project A: Second", detail: null },
    ]);
  });

  it("within a day, project notes (customer's project order) come before operations notes", () => {
    const projectA = project(1, "Project A", [note(1, "2026-08-24", "Kickoff done")]);
    const projectB = project(2, "Project B", [note(2, "2026-08-24", "Blocked on vendor")]);
    const ops = [opsNote(10, "2026-08-24", "Circuit flapping", "SD-WAN")];

    const result = draftWeeklyHighlights(customer([projectA, projectB], ops), WEEK);

    expect(result.map((h) => h.title)).toEqual([
      "Mon 24 Project A: Kickoff done",
      "Mon 24 Project B: Blocked on vendor",
      "Mon 24 [SD-WAN]: Circuit flapping",
    ]);
  });

  it("titles a project note with the project name and an operations note with its bracket", () => {
    const p = project(1, "Project A", [note(1, "2026-08-24", "Kickoff done")]);
    const ops = [opsNote(10, "2026-08-25", "Circuit flapping", "SD-WAN")];

    const result = draftWeeklyHighlights(customer([p], ops), WEEK);

    expect(result).toEqual([
      { title: "Mon 24 Project A: Kickoff done", detail: null },
      { title: "Tue 25 [SD-WAN]: Circuit flapping", detail: null },
    ]);
  });

  it("a multi-line body becomes a title from line one and the rest in detail", () => {
    const p = project(1, "Project A", [note(1, "2026-08-24", "Line one\nLine two\nLine three")]);

    const result = draftWeeklyHighlights(customer([p]), WEEK);

    expect(result).toEqual([{ title: "Mon 24 Project A: Line one", detail: "Line two\nLine three" }]);
  });

  it("cuts a title over 200 characters and puts the full body (never the prefix) in detail", () => {
    const longBody = "x".repeat(250);
    const p = project(1, "Project A", [note(1, "2026-08-24", longBody)]);

    const result = draftWeeklyHighlights(customer([p]), WEEK);

    expect(result).toHaveLength(1);
    expect(result[0].title.length).toBe(200);
    expect(result[0].title.startsWith("Mon 24 Project A: ")).toBe(true);
    expect(result[0].detail).toBe(longBody);
  });

  it("throughDay restricts drafted notes to that day and earlier, project and operations alike", () => {
    const p = project(1, "Project A", [
      note(1, "2026-08-24", "Mon note"),
      note(2, "2026-08-27", "Thu note"),
    ]);
    const ops = [opsNote(10, "2026-08-26", "Wed ops", "SD-WAN")];

    const result = draftWeeklyHighlights(customer([p], ops), WEEK, { throughDay: "2026-08-26" });

    expect(result.map((h) => h.title)).toEqual([
      "Mon 24 Project A: Mon note",
      "Wed 26 [SD-WAN]: Wed ops",
    ]);
  });

  it("a customer with no notes drafts to an empty array", () => {
    expect(draftWeeklyHighlights(customer([]), WEEK)).toEqual([]);
  });
});
