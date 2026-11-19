import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/**
 * Focus management for a modal dialog: on open, moves focus into the dialog
 * (an element marked `data-autofocus`, else the first focusable element, else
 * the container itself — unless something inside already took focus, e.g. an
 * `autoFocus` input); traps Tab / Shift+Tab inside it; and on close returns
 * focus to whatever was focused before, if it is still in the document.
 *
 * Attach `ref` to the `role="dialog"` element (give it `tabIndex={-1}`) and
 * `onKeyDown` to the same element.
 */
export function useDialogFocus(open: boolean): {
  ref: RefObject<HTMLDivElement>;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
} {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const target =
        dialog.querySelector<HTMLElement>("[data-autofocus]") ??
        focusableIn(dialog)[0] ??
        dialog;
      target.focus();
    }
    return () => {
      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Tab") return;
    const dialog = ref.current;
    // A nested portal child (React events bubble through portals) is another
    // dialog's business — only trap events that originate inside this one.
    if (!dialog || !(e.target instanceof Node) || !dialog.contains(e.target)) return;
    const items = focusableIn(dialog);
    if (items.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    // Focus on a non-tabbable element (a programmatically focused heading, the
    // dialog container itself) leaves through the dialog edge as soon as no
    // tabbable item lies ahead of it in the Tab direction, so wrap then too.
    const onItem = active instanceof HTMLElement && items.includes(active);
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    const PRECEDING = Node.DOCUMENT_POSITION_PRECEDING;
    if (e.shiftKey) {
      const leaves =
        active === first ||
        active === dialog ||
        (!onItem &&
          active instanceof Node &&
          !items.some((el) => active.compareDocumentPosition(el) & PRECEDING));
      if (leaves) {
        e.preventDefault();
        last.focus();
      }
    } else {
      const leaves =
        active === last ||
        (!onItem &&
          active !== dialog &&
          active instanceof Node &&
          !items.some((el) => active.compareDocumentPosition(el) & FOLLOWING));
      if (leaves) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return { ref, onKeyDown };
}
