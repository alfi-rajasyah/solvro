import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportFileError } from "../src/lib/pipelineImport/errors.js";
import { createImportParser, ImportAbortedError, type ImportWorker } from "../src/lib/pipelineImport/offThread.js";

// Bounds of the off-thread import parser: the timeout, the worker error
// mapping and the process-wide concurrency cap, against stub workers.

class StubWorker extends EventEmitter {
  terminate = vi.fn();
}

function makeParser(opts: { maxConcurrent?: number; timeoutMs?: number } = {}) {
  const workers: StubWorker[] = [];
  const parse: (b: Buffer, m: Map<string, number>, s?: AbortSignal) => Promise<unknown> = createImportParser({
    maxConcurrent: opts.maxConcurrent ?? 2,
    timeoutMs: opts.timeoutMs ?? 5000,
    spawn: () => {
      const w = new StubWorker();
      workers.push(w);
      return w as unknown as ImportWorker;
    },
  });
  return { parse, workers };
}

const buf = Buffer.from("x");
const pics = new Map<string, number>();
const tick = () => new Promise<void>((r) => setImmediate(r));

afterEach(() => vi.useRealTimers());

describe("createImportParser", () => {
  it("resolves with the rows the worker posts", async () => {
    const { parse, workers } = makeParser();
    const p = parse(buf, pics);
    await tick();
    workers[0].emit("message", { rows: [] });
    await expect(p).resolves.toEqual([]);
    expect(workers[0].terminate).toHaveBeenCalled();
  });

  it("turns a posted ImportFileError back into an ImportFileError", async () => {
    const { parse, workers } = makeParser();
    const p = parse(buf, pics);
    await tick();
    workers[0].emit("message", { error: { code: "legacy_xls", message: "old" } });
    await expect(p).rejects.toMatchObject({ name: "ImportFileError", code: "legacy_xls", message: "old" });
  });

  it("rejects with unreadable_file and terminates the worker after the timeout", async () => {
    vi.useFakeTimers();
    const { parse, workers } = makeParser({ timeoutMs: 5000 });
    const p = parse(buf, pics);
    const assertion = expect(p).rejects.toMatchObject({ code: "unreadable_file" });
    await vi.advanceTimersByTimeAsync(4999);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    await expect(p).rejects.toBeInstanceOf(ImportFileError);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("maps a worker out-of-memory error to unreadable_file, and passes other errors through", async () => {
    const { parse, workers } = makeParser();
    const oom = parse(buf, pics);
    await tick();
    workers[0].emit("error", Object.assign(new Error("heap"), { code: "ERR_WORKER_OUT_OF_MEMORY" }));
    await expect(oom).rejects.toMatchObject({ code: "unreadable_file" });

    const other = parse(buf, pics);
    await tick();
    workers[1].emit("error", new Error("boom"));
    await expect(other).rejects.toThrow("boom");
  });

  it("runs at most maxConcurrent parses and starts the rest in FIFO order", async () => {
    const { parse, workers } = makeParser({ maxConcurrent: 2 });
    const done: number[] = [];
    const ps = [0, 1, 2, 3].map((i) => parse(buf, pics).then(() => done.push(i)));
    await tick();
    expect(workers).toHaveLength(2);

    workers[1].emit("message", { rows: [] });
    await tick();
    expect(workers).toHaveLength(3); // the third request took the freed slot
    workers[0].emit("message", { rows: [] });
    await tick();
    expect(workers).toHaveLength(4);
    workers[2].emit("message", { rows: [] });
    workers[3].emit("message", { rows: [] });
    await Promise.all(ps);
    expect(done).toEqual([1, 0, 2, 3]);
  });

  it("starts the timeout when the worker starts, not while the request waits", async () => {
    vi.useFakeTimers();
    const { parse, workers } = makeParser({ maxConcurrent: 1, timeoutMs: 5000 });
    const first = parse(buf, pics);
    const second = parse(buf, pics);
    await vi.advanceTimersByTimeAsync(4000);
    workers[0].emit("message", { rows: [] }); // frees the slot at t = 4 s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4000); // the second has run 4 s: still alive
    expect(workers).toHaveLength(2);
    expect(workers[1].terminate).not.toHaveBeenCalled();
    const secondAssertion = expect(second).rejects.toMatchObject({ code: "unreadable_file" });
    await vi.advanceTimersByTimeAsync(1000);
    await secondAssertion;
    await expect(first).resolves.toEqual([]);
  });

  it("rejects with a plain error when the worker exits without a message", async () => {
    const { parse, workers } = makeParser();
    const p = parse(buf, pics);
    await tick();
    workers[0].emit("exit", 1);
    await expect(p).rejects.toThrow("Import worker exited with code 1");
    await expect(p).rejects.not.toBeInstanceOf(ImportFileError);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("ignores an exit that follows the result, and terminates once", async () => {
    const { parse, workers } = makeParser();
    const p = parse(buf, pics);
    await tick();
    workers[0].emit("message", { rows: [] });
    workers[0].emit("exit", 0);
    await expect(p).resolves.toEqual([]);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("drops a queued request whose client went away, without starting its worker", async () => {
    const { parse, workers } = makeParser({ maxConcurrent: 1 });
    const first = parse(buf, pics);
    const gone = new AbortController();
    const queued = parse(buf, pics, gone.signal);
    const third = parse(buf, pics);
    await tick();
    gone.abort();
    await expect(queued).rejects.toBeInstanceOf(ImportAbortedError);
    workers[0].emit("message", { rows: [] });
    await first;
    await tick();
    // The slot went to the third request; the aborted one never spawned.
    expect(workers).toHaveLength(2);
    workers[1].emit("message", { rows: [] });
    await expect(third).resolves.toEqual([]);
  });

  it("stops the worker and frees the slot when the client goes away mid-parse", async () => {
    const { parse, workers } = makeParser({ maxConcurrent: 1 });
    const gone = new AbortController();
    const running = parse(buf, pics, gone.signal);
    const next = parse(buf, pics);
    await tick();
    gone.abort();
    await expect(running).rejects.toBeInstanceOf(ImportAbortedError);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    await tick();
    expect(workers).toHaveLength(2);
    workers[1].emit("message", { rows: [] });
    await expect(next).resolves.toEqual([]);
  });

  it("rejects at once when the signal is already aborted", async () => {
    const { parse, workers } = makeParser();
    const gone = new AbortController();
    gone.abort();
    await expect(parse(buf, pics, gone.signal)).rejects.toBeInstanceOf(ImportAbortedError);
    expect(workers).toHaveLength(0);
  });

  it("frees the slot after a failure", async () => {
    const { parse, workers } = makeParser({ maxConcurrent: 1 });
    const a = parse(buf, pics);
    const b = parse(buf, pics);
    await tick();
    workers[0].emit("error", new Error("boom"));
    await expect(a).rejects.toThrow("boom");
    await tick();
    expect(workers).toHaveLength(2);
    workers[1].emit("message", { rows: [] });
    await expect(b).resolves.toEqual([]);
  });
});

describe("createImportParser queue cap", () => {
  it("refuses a request past maxQueued with ImportQueueFullError and keeps the queued ones", async () => {
    const { createImportParser, ImportQueueFullError } = await import("../src/lib/pipelineImport/offThread.js");
    const workers: StubWorker[] = [];
    const parse = createImportParser({
      maxConcurrent: 1,
      maxQueued: 2,
      timeoutMs: 5000,
      spawn: () => {
        const w = new StubWorker();
        workers.push(w);
        return w as unknown as ImportWorker;
      },
    });
    const running = parse(buf, pics);
    const q1 = parse(buf, pics);
    const q2 = parse(buf, pics);
    await expect(parse(buf, pics)).rejects.toBeInstanceOf(ImportQueueFullError);

    await tick();
    workers[0].emit("message", { rows: [] });
    await running;
    await tick();
    workers[1].emit("message", { rows: [] });
    await q1;
    await tick();
    workers[2].emit("message", { rows: [] });
    await expect(q2).resolves.toEqual([]);

    // A freed line accepts new work again.
    const again = parse(buf, pics);
    await tick();
    workers[3].emit("message", { rows: [] });
    await expect(again).resolves.toEqual([]);
  });
});
