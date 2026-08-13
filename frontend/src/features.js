// Feature flags — flip to true when a feature is ready to ship.
export const FEATURES = {
  // Flashcard decks, editor, and FSRS study sessions (backend-backed).
  // The backend side is gated separately via the ENABLE_FLASHCARDS env var
  // (see backend/app/config.py).
  flashcards: true,
};
