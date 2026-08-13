// Feature flags — flip to true when a feature is ready to ship.
//
// These are build-time defaults baked into the bundle. The backend gates the
// same features at runtime (ENABLE_FLASHCARDS, see backend/app/config.py), so
// App fetches GET /api/features on boot and keeps the intersection. Without
// that step the two can diverge, leaving a fully visible Flashcards section
// whose every request 404s.
export const FEATURES = {
  // Flashcard decks, editor, and FSRS study sessions (backend-backed).
  flashcards: true,
};

// Narrow the build-time flags to what the API actually serves. A flag can only
// be turned *off* here — we can't render UI the bundle didn't build, but hiding
// UI the server won't serve is exactly the point.
export function applyServerFeatures(serverFeatures) {
  if (!serverFeatures) return;
  for (const key of Object.keys(FEATURES)) {
    if (serverFeatures[key] === false) FEATURES[key] = false;
  }
}
