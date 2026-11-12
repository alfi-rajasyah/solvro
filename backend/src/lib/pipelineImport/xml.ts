// Linear-time helpers for reading the few OOXML parts the import needs.
// They never build a DOM and never expand entities beyond the five XML
// built-ins and numeric references, so a hostile part cannot trigger entity
// expansion or regex backtracking.

const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function codePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** XML text -> plain text, including OOXML's `_xHHHH_` escapes. */
export function decodeXmlText(s: string): string {
  if (s.indexOf("&") === -1 && s.indexOf("_x") === -1) return s;
  return s
    .replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, (_m, ref: string) => {
      if (ref.startsWith("#x")) return codePoint(Number.parseInt(ref.slice(2), 16));
      if (ref.startsWith("#")) return codePoint(Number.parseInt(ref.slice(1), 10));
      return ENTITY[ref];
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** Attributes of one start tag's text (between the tag name and `>`). */
export function parseAttrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) out.set(m[1], decodeXmlText(m[2] ?? m[3] ?? ""));
  return out;
}

/** Value of the first attribute whose local name (after any `prefix:`) is `local`. */
export function attrByLocalName(attrs: Map<string, string>, local: string): string | undefined {
  for (const [k, v] of attrs) {
    const i = k.indexOf(":");
    if ((i === -1 ? k : k.slice(i + 1)) === local) return v;
  }
  return undefined;
}

/**
 * The namespace prefix of a part's root element, with its colon (`"x:"`), or
 * `""`. Some generators write every SpreadsheetML tag with a prefix.
 */
export function rootPrefix(xml: string): string {
  let i = 0;
  for (;;) {
    i = xml.indexOf("<", i);
    if (i === -1) return "";
    const next = xml[i + 1];
    if (next !== "?" && next !== "!") break;
    i++;
  }
  let j = i + 1;
  while (j < xml.length && !/[\s/>]/.test(xml[j])) j++;
  const name = xml.slice(i + 1, j);
  const colon = name.indexOf(":");
  return colon === -1 ? "" : name.slice(0, colon + 1);
}

export interface XmlElement {
  attrs: string;
  /** Inner XML, or null for a self-closing element. */
  inner: string | null;
}

/**
 * Every `<tag ...>...</tag>` or `<tag .../>` in `xml`, in document order.
 * Assumes the tag never nests inside itself, which holds for every tag the
 * import reads (`row`, `c`, `v`, `is`, `si`, `t`, `sheet`, `Relationship`).
 */
export function* elements(xml: string, tag: string): Generator<XmlElement> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let i = 0;
  for (;;) {
    i = xml.indexOf(open, i);
    if (i === -1) return;
    const after = xml[i + open.length];
    if (after !== ">" && after !== "/" && after !== " " && after !== "\t" && after !== "\n" && after !== "\r") {
      i += open.length;
      continue;
    }
    const gt = xml.indexOf(">", i + open.length);
    if (gt === -1) return;
    const attrs = xml.slice(i + open.length, gt);
    if (xml[gt - 1] === "/") {
      yield { attrs: attrs.slice(0, -1), inner: null };
      i = gt + 1;
      continue;
    }
    const end = xml.indexOf(close, gt + 1);
    if (end === -1) return;
    yield { attrs, inner: xml.slice(gt + 1, end) };
    i = end + close.length;
  }
}

/** Inner XML of the first `tag` element, or null. */
export function firstInner(xml: string, tag: string): string | null {
  for (const el of elements(xml, tag)) return el.inner ?? "";
  return null;
}

/** `xml` with every `<tag>...</tag>` section removed. */
export function stripElements(xml: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  if (xml.indexOf(open) === -1) return xml;
  let out = "";
  let i = 0;
  for (;;) {
    const s = xml.indexOf(open, i);
    if (s === -1) break;
    const e = xml.indexOf(close, s);
    if (e === -1) break;
    out += xml.slice(i, s);
    i = e + close.length;
  }
  return out + xml.slice(i);
}
