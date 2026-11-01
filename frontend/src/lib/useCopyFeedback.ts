import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

export type CopyFeedback = "copied" | "failed" | null;

/**
 * Shared behaviour of the copy icon buttons (`CopyLinkButton`,
 * `CopyTextButton`): copy `getText()` at click time, then expose a
 * short-lived "copied"/"failed" state for an inline live region. The app has
 * no global toast, so each button shows its own message.
 */
export function useCopyFeedback(getText: () => string): {
  feedback: CopyFeedback;
  copy: () => Promise<void>;
} {
  const [feedback, setFeedback] = useState<CopyFeedback>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest getter without making `copy` change identity every render.
  const getTextRef = useRef(getText);
  useEffect(() => {
    getTextRef.current = getText;
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    let next: CopyFeedback = "copied";
    try {
      await copyText(getTextRef.current());
    } catch {
      next = "failed";
    }
    if (timer.current) clearTimeout(timer.current);
    // Clear first, then set on the next tick: a repeat click within the window
    // changes the live region's text again, so it is re-announced.
    setFeedback(null);
    timer.current = setTimeout(() => {
      setFeedback(next);
      timer.current = setTimeout(() => setFeedback(null), 1800);
    }, 50);
  }, []);

  return { feedback, copy };
}
