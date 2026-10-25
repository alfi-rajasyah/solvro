import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { cn } from "@/lib/utils";

/**
 * Icon button that copies a piece of text (a generated password, say) and
 * confirms with a short "Copied" message beside it. Same pattern as
 * `CopyLinkButton`: the app has no global toast, so the message is a
 * self-clearing live region next to the button, and a clipboard failure says
 * so instead of failing silently.
 * (docs/archive/plans/application-review-2026-10-22.md, F-38.)
 */
export function CopyTextButton({
  label,
  getText,
  className = "",
}: {
  /** Accessible name and tooltip, e.g. "Copy temporary password". */
  label: string;
  /** Runs at click time. */
  getText: () => string;
  className?: string;
}) {
  const { feedback, copy } = useCopyFeedback(getText);

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center rounded-sm text-on-surface-variant outline-hidden transition-colors hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/30",
          className,
        )}
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          {feedback === "copied" ? "check" : "content_copy"}
        </span>
      </button>
      <span
        role="status"
        className={
          feedback
            ? cn("text-meta", feedback === "failed" ? "text-error" : "text-on-surface-variant")
            : "sr-only"
        }
      >
        {feedback === "copied" ? "Copied" : feedback === "failed" ? "Could not copy" : ""}
      </span>
    </span>
  );
}
