// Minimal ZIP reader for the Pipeline import (.xlsx is a ZIP of XML parts).
// It reads only what an .xlsx needs: stored and deflated entries, no ZIP64,
// no encryption. Every inflate has a hard output limit, so a file that
// claims small sizes but expands to gigabytes (a "zip bomb") fails fast
// instead of exhausting the backend's memory. Replaces the browser-side
// SheetJS parse (docs/archive/plans/application-review-2026-10-22.md, B-18).
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipLimits {
  /** Most entries the archive may list. */
  maxEntries: number;
  /** Most bytes all entries read through `read` may expand to, together. */
  maxTotalBytes: number;
}

interface Entry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

export interface ZipArchive {
  has(name: string): boolean;
  /** Expanded bytes of one entry, or null when the archive has no such entry. */
  read(name: string): Buffer | null;
}

function findEocd(buf: Buffer): number {
  // The end record is 22 bytes plus a comment of at most 65535 bytes.
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new ZipError("No ZIP end record");
}

export function openZip(buf: Buffer, limits: ZipLimits): ZipArchive {
  if (buf.length < 22) throw new ZipError("File too short");
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError("ZIP64 is not supported");
  if (count > limits.maxEntries) throw new ZipError("Too many ZIP entries");
  if (cdOffset + cdSize > buf.length) throw new ZipError("Central directory out of range");

  const entries = new Map<string, Entry>();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new ZipError("Bad central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen > buf.length) throw new ZipError("Bad entry name");
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if ((flags & 0x1) !== 0) throw new ZipError("Encrypted entries are not supported");
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  let budget = limits.maxTotalBytes;

  return {
    has: (name) => entries.has(name),
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lo = e.localOffset;
      if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== LOC_SIG) throw new ZipError("Bad local header");
      const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
      const end = start + e.compressedSize;
      if (end > buf.length) throw new ZipError("Entry data out of range");
      const data = buf.subarray(start, end);
      let out: Buffer;
      if (e.method === 0) {
        out = Buffer.from(data);
      } else if (e.method === 8) {
        if (budget <= 0) throw new ZipError("Archive expands too far");
        try {
          out = inflateRawSync(data, { maxOutputLength: budget });
        } catch {
          throw new ZipError("Entry cannot be inflated or expands too far");
        }
      } else {
        throw new ZipError("Unsupported compression method");
      }
      if (out.length > budget) throw new ZipError("Archive expands too far");
      budget -= out.length;
      return out;
    },
  };
}
