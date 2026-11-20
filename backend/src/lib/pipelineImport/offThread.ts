// Runs parseImportFile in a worker thread so a hostile or huge upload (a
// 1 MB .xlsx may expand to 16 MB of XML) cannot block the API's event loop
// for the 0.2 to 1 s its parse takes on the request thread. The pool is
// bounded: at most MAX_CONCURRENT parses run at once (the rest queue in
// order), each worker has a memory cap, and a parse that takes over
// TIMEOUT_MS is terminated. All three failures answer as "unreadable_file".
// Past MAX_QUEUED waiting requests a new one is refused at once
// (ImportQueueFullError, answered as 503), so many users at once cannot pile
// up uploads of up to 1 MB each in memory.
// A request whose client has gone (its AbortSignal fires) leaves the queue,
// or has its worker stopped, so it stops holding a slot.
import { Worker } from "node:worker_threads";
import { ImportFileError, UNREADABLE_FILE_MESSAGE } from "./errors.js";
import type { ParsedRow } from "./parseRow.js";

const MAX_CONCURRENT = 2;
const MAX_QUEUED = 8;
const TIMEOUT_MS = 5000;
const MAX_OLD_GENERATION_MB = 256;

// Compiled (`dist/*.js`) and dev/test (`src/*.ts` through tsx or vitest) run
// the same module, so the worker file takes this file's own extension.
// Source files need tsx in the worker too (vitest does not pass its loader on).
const FROM_SOURCE = import.meta.url.endsWith(".ts");
const WORKER_URL = new URL(`./importWorker${FROM_SOURCE ? ".ts" : ".js"}`, import.meta.url);

type WorkerMessage = { rows?: ParsedRow[]; error?: { code: ImportFileError["code"]; message: string } };

/** The part of `Worker` this module uses; tests pass a stub. */
export interface ImportWorker {
  once(event: "message", cb: (msg: WorkerMessage) => void): unknown;
  once(event: "error", cb: (err: Error) => void): unknown;
  once(event: "exit", cb: (code: number) => void): unknown;
  terminate(): unknown;
}

function spawnWorker(file: Uint8Array, picByUsername: Map<string, number>): ImportWorker {
  return new Worker(WORKER_URL, {
    workerData: { file, picByUsername },
    transferList: [file.buffer as ArrayBuffer],
    resourceLimits: { maxOldGenerationSizeMb: MAX_OLD_GENERATION_MB },
    ...(FROM_SOURCE && { execArgv: ["--import", "tsx"] }),
  }) as unknown as ImportWorker;
}

/** The caller's client went away before the parse finished; nobody reads the answer. */
export class ImportAbortedError extends Error {
  constructor() {
    super("Import preview request was closed");
    this.name = "ImportAbortedError";
  }
}

/** Every parse slot is busy and the waiting line is full. */
export class ImportQueueFullError extends Error {
  constructor() {
    super(IMPORT_BUSY_MESSAGE);
    this.name = "ImportQueueFullError";
  }
}

export const IMPORT_BUSY_MESSAGE = "Other imports are being read right now. Try again in a minute.";

export interface ImportParserOptions {
  maxConcurrent: number;
  /** Most requests allowed to wait for a slot; one more is refused. */
  maxQueued?: number;
  timeoutMs: number;
  spawn: (file: Uint8Array, picByUsername: Map<string, number>) => ImportWorker;
}

export function createImportParser({ maxConcurrent, maxQueued = MAX_QUEUED, timeoutMs, spawn }: ImportParserOptions) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const acquire = (signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) return Promise.reject(new ImportAbortedError());
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    if (waiting.length >= maxQueued) return Promise.reject(new ImportQueueFullError());
    return new Promise((resolve, reject) => {
      const take = () => {
        signal?.removeEventListener("abort", leave);
        resolve();
      };
      // Leaving the queue gives back no slot: this waiter never held one.
      const leave = () => {
        const i = waiting.indexOf(take);
        if (i !== -1) waiting.splice(i, 1);
        reject(new ImportAbortedError());
      };
      waiting.push(take);
      signal?.addEventListener("abort", leave, { once: true });
    });
  };
  // A freed slot goes straight to the next waiter, so `active` stays put.
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  const run = (buf: Buffer, picByUsername: Map<string, number>, signal?: AbortSignal): Promise<ParsedRow[]> =>
    new Promise((resolve, reject) => {
      // An abort between acquire and here would never fire its listener below.
      if (signal?.aborted) return reject(new ImportAbortedError());
      // A copy: the worker owns it, the request body stays intact.
      const worker = spawn(new Uint8Array(buf), picByUsername);
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        // Not awaited: the slot frees at once. A timed-out worker may still be
        // inside a native inflate call for a few tens of ms while the next one
        // starts; that brief overlap is accepted.
        void worker.terminate();
        fn();
      };
      // The clock starts here, when the worker starts, not when it queued.
      const timer = setTimeout(
        () => settle(() => reject(new ImportFileError("unreadable_file", UNREADABLE_FILE_MESSAGE))),
        timeoutMs,
      );
      worker.once("message", (msg) =>
        settle(() =>
          msg.error ? reject(new ImportFileError(msg.error.code, msg.error.message)) : resolve(msg.rows ?? []),
        ),
      );
      // Out of memory (ERR_WORKER_OUT_OF_MEMORY) is a bad file, not a server bug.
      worker.once("error", (err) =>
        settle(() =>
          reject(
            (err as NodeJS.ErrnoException).code === "ERR_WORKER_OUT_OF_MEMORY"
              ? new ImportFileError("unreadable_file", UNREADABLE_FILE_MESSAGE)
              : err,
          ),
        ),
      );
      worker.once("exit", (code) => settle(() => reject(new Error(`Import worker exited with code ${code}`))));
      const onAbort = () => settle(() => reject(new ImportAbortedError()));
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  return async (buf: Buffer, picByUsername: Map<string, number>, signal?: AbortSignal): Promise<ParsedRow[]> => {
    await acquire(signal);
    try {
      return await run(buf, picByUsername, signal);
    } finally {
      release();
    }
  };
}

export const parseImportFileOffThread = createImportParser({
  maxConcurrent: MAX_CONCURRENT,
  timeoutMs: TIMEOUT_MS,
  spawn: spawnWorker,
});
