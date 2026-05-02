import { useState, type FormEvent } from "react";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { useAddComment, useComments } from "@/lib/queries";

export function CommentThread({ taskId }: { taskId: number }) {
  const { data: comments, isLoading, isError, error } = useComments(taskId);
  const addComment = useAddComment(taskId);
  const [body, setBody] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await addComment.mutateAsync(trimmed);
      setBody("");
    } catch {
      // surfaced via mutation error state below
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
        Comments {comments && comments.length > 0 && `· ${comments.length}`}
      </h3>

      {isLoading && (
        <div className="h-12 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      )}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container">
          Could not load comments: {(error as Error).message}
        </div>
      )}

      {comments && comments.length === 0 && (
        <p className="text-xs text-on-surface-variant">No comments yet.</p>
      )}

      {comments && comments.length > 0 && (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <AssigneeAvatar user={c.author} size="sm" />
              <div className="min-w-0 flex-1 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2">
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-on-surface">{c.author.username}</span>
                  <span className="text-on-surface-variant">{relativeTime(c.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-xs text-on-surface">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded border border-outline-variant bg-surface-container-lowest p-2"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="Add a comment…"
          className="w-full resize-y rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="submit"
            disabled={addComment.isPending || !body.trim()}
            className="rounded bg-primary px-3 py-1 font-display text-[11px] font-bold text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            {addComment.isPending ? "Posting…" : "Post"}
          </button>
        </div>
        {addComment.error && (
          <p className="mt-1 text-[11px] text-error">
            {(addComment.error as Error).message}
          </p>
        )}
      </form>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
