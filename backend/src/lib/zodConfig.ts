import { z } from "zod";

// Keeps zod 3's default issue messages under zod 4
// (docs/archive/plans/zod-4-upgrade.md, decision Q1 = A). The 400 body's
// `details.fieldErrors` reaches users through frontend/src/lib/formErrors.ts,
// so the upgrade must not change its wording. A schema's own `message`/`error`
// still wins: zod consults this global map only for issues without one.
// Returning undefined falls back to zod 4's English locale.
// Pinned by backend/test/validationContract.test.ts.

/** zod 3's name for the type of a received value ("nan", "array", "date", …). */
function receivedType(input: unknown): string {
  if (input === null) return "null";
  if (Array.isArray(input)) return "array";
  if (input instanceof Date) return "date";
  if (input instanceof Map) return "map";
  if (input instanceof Set) return "set";
  if (input instanceof Promise) return "promise";
  if (typeof input === "number" && Number.isNaN(input)) return "nan";
  return typeof input;
}

function sizeMessage(
  origin: string,
  bound: number | bigint | Date,
  side: "min" | "max",
  inclusive: boolean,
  exact: boolean,
): string | undefined {
  const value = bound instanceof Date ? bound.toISOString() : String(bound);
  if (origin === "string") {
    const word = exact ? "exactly" : side === "min" ? (inclusive ? "at least" : "over") : inclusive ? "at most" : "under";
    return `String must contain ${word} ${value} character(s)`;
  }
  if (origin === "array" || origin === "set") {
    const word = exact
      ? "exactly"
      : side === "min"
        ? inclusive
          ? "at least"
          : "more than"
        : inclusive
          ? "at most"
          : "less than";
    return `Array must contain ${word} ${value} element(s)`;
  }
  if (origin === "number" || origin === "int" || origin === "bigint") {
    const word = exact
      ? "exactly equal to"
      : side === "min"
        ? inclusive
          ? "greater than or equal to"
          : "greater than"
        : inclusive
          ? "less than or equal to"
          : "less than";
    return `Number must be ${word} ${value}`;
  }
  if (origin === "date") {
    const word = side === "min" ? "greater than or equal to" : "smaller than or equal to";
    return `Date must be ${word} ${value}`;
  }
  return undefined;
}

/** zod 3's option list: strings quoted, numbers bare ("'a' | 'b'", "1 | 2"). */
function joinOptions(values: readonly unknown[]): string {
  return values.map((v) => (typeof v === "string" ? `'${v}'` : String(v))).join(" | ");
}

/** True when the failing schema carries an `.int()` check. */
function isIntSchema(issue: z.core.$ZodRawIssue): boolean {
  type Check = { _zod?: { def?: { check?: unknown; format?: unknown } } };
  const inst = issue.inst as { _zod?: { def?: { checks?: Check[] } } } | undefined;
  return (inst?._zod?.def?.checks ?? []).some(
    (c) => c._zod?.def?.check === "number_format" && c._zod.def.format === "safeint",
  );
}

const FORMAT_MESSAGES: Record<string, string> = {
  email: "Invalid email",
  url: "Invalid url",
  guid: "Invalid uuid",
  uuid: "Invalid uuid",
  datetime: "Invalid datetime",
  date: "Invalid date",
  regex: "Invalid",
};

export function zod3Message(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case "invalid_type": {
      if (issue.input === undefined) return "Required";
      if (issue.expected === "int") return "Expected integer, received float";
      if (issue.expected === "date") return "Invalid date";
      if (issue.expected === "number" && typeof issue.input === "number" && !Number.isNaN(issue.input)) {
        // Infinity: zod 3 accepted it on a plain number and called it a float on an int.
        return isIntSchema(issue) ? "Expected integer, received float" : "Number must be finite";
      }
      return `Expected ${issue.expected}, received ${receivedType(issue.input)}`;
    }
    case "too_small":
      return sizeMessage(issue.origin, issue.minimum, "min", issue.inclusive ?? true, issue.exact ?? false);
    case "too_big":
      return sizeMessage(issue.origin, issue.maximum, "max", issue.inclusive ?? true, issue.exact ?? false);
    case "invalid_value": {
      if (issue.values.length === 1) return `Invalid literal value, expected ${JSON.stringify(issue.values[0])}`;
      // zod 3 checked an enum's input type first: a missing value was "Required"
      // and a value that is neither a string nor a number named its type.
      // zod 4 reports both as invalid_value. A number on a string z.enum also
      // named its type in zod 3, but on z.nativeEnum it got the enum text; zod 4
      // cannot tell the two apart, so a number gets the nativeEnum text (Prisma
      // enums are the common case here).
      if (issue.input === undefined) return "Required";
      const options = joinOptions(issue.values);
      if (typeof issue.input !== "string" && typeof issue.input !== "number") {
        return `Expected ${options}, received ${receivedType(issue.input)}`;
      }
      return `Invalid enum value. Expected ${options}, received '${String(issue.input)}'`;
    }
    case "invalid_format": {
      if (issue.format === "starts_with") return `Invalid input: must start with "${String(issue.prefix)}"`;
      if (issue.format === "ends_with") return `Invalid input: must end with "${String(issue.suffix)}"`;
      if (issue.format === "includes") return `Invalid input: must include "${String(issue.includes)}"`;
      return FORMAT_MESSAGES[issue.format] ?? "Invalid";
    }
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${issue.keys.map((k) => `'${k}'`).join(", ")}`;
    case "not_multiple_of":
      return `Number must be a multiple of ${String(issue.divisor)}`;
    case "invalid_union": {
      const { discriminator, options } = issue as { discriminator?: unknown; options?: unknown };
      if (discriminator !== undefined && Array.isArray(options)) {
        return `Invalid discriminator value. Expected ${joinOptions(options)}`;
      }
      return "Invalid input";
    }
    case "custom":
      return "Invalid input";
    default:
      return undefined;
  }
}

z.config({ customError: zod3Message });
