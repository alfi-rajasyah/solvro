// Worker-thread side of parseImportFileOffThread: parses one upload and posts
// back the rows, or the ImportFileError code and message.
import { parentPort, workerData } from "node:worker_threads";
import { ImportFileError, parseImportFile } from "./index.js";

const { file, picByUsername } = workerData as { file: Uint8Array; picByUsername: Map<string, number> };
try {
  const rows = parseImportFile(Buffer.from(file.buffer, file.byteOffset, file.byteLength), picByUsername);
  parentPort!.postMessage({ rows });
} catch (err) {
  if (err instanceof ImportFileError) parentPort!.postMessage({ error: { code: err.code, message: err.message } });
  else throw err; // an unexpected failure becomes the worker's "error" event
}
