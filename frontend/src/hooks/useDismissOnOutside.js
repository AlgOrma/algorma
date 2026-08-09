import { useEffect, useRef } from 'react';

// Dismiss a floating layer (dropdown, popover) when the user clicks anywhere
// outside it or presses Escape.
//
// Returns a ref to put on the element that wraps *both* the trigger and the
// menu — keeping the trigger inside means clicking it still toggles normally
// instead of the outside-handler closing the menu a beat before the trigger's
// own onClick reopens it.
//
// The listener is bound on `mousedown` (not `click`) so the menu is gone before
// the click lands on whatever is underneath, and only while the layer is open.
export default function useDismissOnOutside(isOpen, onDismiss) {
  const containerRef = useRef(null);
  // Held in a ref so an inline arrow function passed as onDismiss doesn't
  // rebind the document listeners on every render.
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        onDismissRef.current();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onDismissRef.current();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return containerRef;
}
