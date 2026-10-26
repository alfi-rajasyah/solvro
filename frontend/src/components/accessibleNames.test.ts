import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { LinkFields } from "@/components/LinksSection";
import { ToolsEditor } from "@/components/services/ServiceMappingList";
import { SubtaskRow } from "@/components/TaskFormModal";

// A placeholder is not an accessible name: every input / textarea / select must carry an
// aria-label (or sit inside a <label> with text)
// (docs/archive/plans/application-review-2026-10-22.md, F-37).

const openingTags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];

describe("rendered inputs have an accessible name", () => {
  it("each service's tool input names its service", () => {
    const names = ["Penetration Testing", "SOC Monitoring"].map((serviceName) => {
      const html = renderToStaticMarkup(
        createElement(ToolsEditor, {
          serviceName,
          tools: [],
          canMutate: true,
          saving: false,
          onChange: () => {},
        }),
      );
      const inputs = openingTags(html, "input");
      expect(inputs).toHaveLength(1);
      return /aria-label="([^"]+)"/.exec(inputs[0] ?? "")?.[1] ?? "";
    });
    expect(names[0]).toContain("Penetration Testing");
    expect(names[1]).toContain("SOC Monitoring");
    expect(names[0]).not.toBe(names[1]);
  });

  it("LinksSection's label and URL inputs (add form and edited row)", () => {
    for (const withPlaceholders of [true, false]) {
      const html = renderToStaticMarkup(
        createElement(LinkFields, {
          label: "",
          url: "",
          onLabelChange: () => {},
          onUrlChange: () => {},
          withPlaceholders,
        }),
      );
      const inputs = openingTags(html, "input");
      expect(inputs).toHaveLength(2);
      for (const input of inputs) expect(input).toMatch(/aria-label="[^"]+"/);
    }
  });

  it("the task form's subtask checkbox names the subtask", () => {
    const html = renderToStaticMarkup(
      createElement(SubtaskRow, {
        subtask: { id: 7, title: "Write tests", status: "TODO" },
        canEdit: true,
        isFirst: true,
        isLast: true,
        onToggle: () => {},
        onMove: () => {},
      }),
    );
    const inputs = openingTags(html, "input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain('type="checkbox"');
    expect(inputs[0]).toContain("aria-label=\"Mark subtask &quot;Write tests&quot; done\"");
  });
});

// --- source guard -----------------------------------------------------------

const SRC = join(__dirname, "..");
// Vendored shadcn/ReUI primitives name their own controls through props.
const VENDORED = /[\\/]components[\\/](ui|reui)[\\/]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (path.endsWith(".tsx") && !VENDORED.test(path)) out.push(path);
  }
  return out;
}

/** Blanks out comments (keeping offsets and line numbers) so prose that mentions `<input>` is not scanned. */
function withoutComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^[ \t]*\/\/.*$/gm, blank);
}

/** Opening `<input>` / `<textarea>` / `<select>` / `<Input>` / `<Textarea>` tags of a JSX source, braces and quotes respected. */
function controlTags(source: string): { index: number; tag: string }[] {
  const found: { index: number; tag: string }[] = [];
  const re = /<(input|textarea|select|Input|Textarea)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || (c === "`" && depth > 0)) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && source[i - 1] !== "=") break;
    }
    found.push({ index: m.index, tag: source.slice(m.index, i + 1) });
  }
  return found;
}

/** The brace-balanced JSX expression after `prefix` (which ends in `{`), quotes respected; null if absent. */
function braceExpression(tag: string, prefix: RegExp): string | null {
  const m = prefix.exec(tag);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let quote: string | null = null;
  for (let i = start; i < tag.length; i++) {
    const c = tag[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return tag.slice(start, i).trim();
  }
  return null;
}

/**
 * True when the control sits inside a `<label>` that has visible text before it
 * (or a `<Field label=...>` wrapper). A bare wrapper with no text names nothing.
 */
function insideLabelOrField(source: string, index: number, tagLength: number): boolean {
  const before = source.slice(Math.max(0, index - 1500), index);
  const label = before.lastIndexOf("<label");
  const field = Math.max(before.lastIndexOf("<Field "), before.lastIndexOf("<Field\n"));
  const close = Math.max(before.lastIndexOf("</label>"), before.lastIndexOf("</Field>"));
  const open = Math.max(label, field);
  if (open <= close) return false;
  const wrapper = before.slice(open);
  if (open === field) return /\blabel=/.test(wrapper);
  // The label's text may come before the control or after it (a checkbox row).
  // Drop the tags themselves; what is left must contain text or an expression.
  const afterEnd = source.indexOf("</label>", index);
  const after = afterEnd === -1 ? "" : source.slice(index + tagLength, afterEnd);
  return /[A-Za-z{]/.test((wrapper + after).replace(/<[^>]*>/g, " "));
}

// Files another change is still labelling; empty this list once they are done.
const PENDING = new Set<string>();

describe("source guard: no unlabelled input, textarea or select", () => {
  it("every <input> / <textarea> / <select> / <Input> / <Textarea> has a non-empty aria-label, a spread, a <label htmlFor>, or an enclosing <label> with text", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (PENDING.has(rel)) continue;
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const { index, tag } of controlTags(source)) {
        // type="hidden" and `display: none` controls are not in the accessibility tree.
        if (/type="hidden"/.test(tag) || /className="hidden"/.test(tag)) continue;
        const id = /\bid="([^"]+)"/.exec(tag)?.[1];
        if (id && source.includes(`htmlFor="${id}"`)) continue;
        // `id={`${uid}-x`}` paired with `htmlFor={`${uid}-x`}` (useId).
        const idExpr = braceExpression(tag, /\bid=\{/);
        if (idExpr && source.includes(`htmlFor={${idExpr}}`)) continue;
        // A non-empty aria-label / aria-labelledby. A `{...spread}` is trusted to
        // supply the name (CommentMentions builds its aria-label that way): the
        // guard cannot see inside it.
        if (/aria-label(ledby)?="[^"]+"/.test(tag) || /aria-label(ledby)?=\{/.test(tag)) continue;
        if (/\{\.\.\.\w+\}/.test(tag)) continue;
        if (insideLabelOrField(source, index, tag.length)) continue;
        const line = source.slice(0, index).split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
