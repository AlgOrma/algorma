// Keyboard-operability props for click targets that aren't <button> elements
// (rows, expanders, toggle pills). Mirrors the native button contract — Tab
// focus, Enter/Space activation — without changing the element's markup or
// styling. Pass extra ARIA (role, aria-expanded, aria-label…) as overrides.
export function pressable(onActivate, overrides = {}) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      // Only activate on keys pressed on this element itself — keydowns from
      // nested focusable controls (row action buttons) bubble through here.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(e);
      }
    },
    ...overrides,
  };
}
