import { useEffect } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Traps Tab inside `ref` while `active`: moves focus to `initialRef` (or the
// dialog's first control) on open, wraps Tab/Shift+Tab at the edges, and
// restores focus to the previously focused element on close.
export default function useFocusTrap(ref, active, initialRef) {
  useEffect(() => {
    if (!active) return;
    const invoker = document.activeElement;
    const node = ref.current;
    (initialRef?.current || node?.querySelector(FOCUSABLE))?.focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const isOutside = !node.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || isOutside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || isOutside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      invoker?.focus?.();
    };
  }, [ref, active, initialRef]);
}
