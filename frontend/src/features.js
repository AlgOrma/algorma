// Feature flags — flip to true when a feature is ready to ship.
export const FEATURES = {
  // Flashcard decks & review sessions. The current UI is a placeholder running
  // on localStorage mock cards (not the backend API), so it stays hidden until
  // it's actually implemented. The backend side is gated separately via the
  // ENABLE_FLASHCARDS env var (see backend/app/config.py).
  flashcards: false,

  // Cookie-session authentication: the login / sign-up screen, logout, and
  // SSO buttons, against the /api/auth/* contract in AUTH_DESIGN.md. The
  // backend no longer accepts the legacy X-User-Id header, so this stays on.
  auth: true,
};
