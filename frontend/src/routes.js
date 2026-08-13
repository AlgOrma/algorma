// URL <-> screen mapping for the app shell. Lives outside App.jsx so the
// component file only exports components (Fast Refresh) and so these pure
// helpers can be unit-tested without mounting the whole app.
import { FEATURES } from './features';

// URL path for each screen, so pages are shareable endpoints (e.g. /revise).
// Feature-flagged screens are left out entirely, so their URLs don't resolve.
const SCREEN_PATHS = {
  dashboard: '/dashboard',
  problems: '/problems',
  leetcode: '/leetcode',
  'custom-lists': '/custom-lists',
  templates: '/templates',
  revise: '/revise',
  ...(FEATURES.flashcards
    ? {
        flashcards: '/flashcards',
        'flashcards-study': '/flashcards/study',
        'flashcards-editor': '/flashcards/editor',
      }
    : {})
};

// '/problems/<id>' opens that problem's detail screen directly.
// '/revise/<id>' lands on the revision screen (RevisionSession reads the id
// itself and starts a session for that problem).
// The flashcards screens carry state the URL has to round-trip: which deck a
// study session covers, and which card the editor is editing. Keeping it in
// React state alone means a reload of /flashcards/editor silently turns an edit
// into a blank new card, and /flashcards/study into "every deck".
// The "(General / Unassigned)" bucket rides along as an ordinary deck id
// (UNASSIGNED_DECK), so there is no empty-but-meaningful case to preserve.
function flashcardParams(search) {
  const q = new URLSearchParams(search || '');
  return { deckId: q.get('deck') || null, cardId: q.get('card') || null };
}

function screenFromPath(pathname, search = '') {
  const detailMatch = pathname.match(/^\/problems\/([^/]+)$/);
  if (detailMatch) return { screen: 'detail', id: detailMatch[1] };
  if (/^\/revise\/[^/]+$/.test(pathname)) return { screen: 'revise', id: null };
  if (/^\/flashcards\/study$/.test(pathname))
    return { screen: 'flashcards-study', id: null, ...flashcardParams(search) };
  if (/^\/flashcards\/editor$/.test(pathname))
    return { screen: 'flashcards-editor', id: null, ...flashcardParams(search) };
  const entry = Object.entries(SCREEN_PATHS).find(([, path]) => path === pathname);
  return entry ? { screen: entry[0], id: null } : null;
}

function pathForScreen(screen, selectedId, params = {}) {
  if (screen === 'detail' && selectedId) return `/problems/${selectedId}`;
  const base = SCREEN_PATHS[screen] || '/dashboard';
  if (screen === 'flashcards-study' && params.studyDeckId) {
    return `${base}?deck=${encodeURIComponent(params.studyDeckId)}`;
  }
  if (screen === 'flashcards-editor') {
    if (params.editorCardId) return `${base}?card=${encodeURIComponent(params.editorCardId)}`;
    if (params.editorPresetDeckId) {
      return `${base}?deck=${encodeURIComponent(params.editorPresetDeckId)}`;
    }
  }
  return base;
}

export { SCREEN_PATHS, screenFromPath, pathForScreen };
