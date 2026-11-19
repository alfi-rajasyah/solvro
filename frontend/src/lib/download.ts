/**
 * Saves `blob` through a transient anchor click. The object URL is revoked on
 * a later task: revoking in the same tick as `click()` can cancel the
 * download in browsers that start it asynchronously.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
