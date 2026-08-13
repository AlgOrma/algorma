// Tiny fetch client for the AlgOrma API.
//
// The backend has no auth: it identifies the current profile from an
// `X-User-Id` header. The durable copy is the `dsa_user` profile object in
// localStorage (persisted by App's useLocalStorage); App also mirrors the id
// here in memory, and that mirror wins — see setCurrentUserId.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const USER_KEY = 'dsa_user';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// `undefined` until App syncs it — that's what makes the localStorage read
// below a fallback rather than a competing source of truth.
let activeUserId;

// Keep the client's identity in step with the profile App is rendering.
//
// Adopting a profile (first run on a fresh browser, or after localStorage is
// cleared) sets React state one effect-flush before useLocalStorage writes
// `dsa_user` — and React runs child effects before parent ones, so a page's
// mount fetch would read the not-yet-written key and send no header at all.
// Mirroring the id in memory during render closes that window.
export function setCurrentUserId(id) {
  activeUserId = id || null;
}

// Current profile id: the in-memory mirror once App has synced it, otherwise
// the persisted profile (first tick, and any non-App consumer).
export function currentUserId() {
  if (activeUserId !== undefined) return activeUserId;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))?.id || null;
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const uid = auth ? currentUserId() : null;
  if (uid) headers['X-User-Id'] = uid;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  if (!res.ok) {
    let detail;
    try {
      detail = (await res.json())?.detail;
    } catch {
      // non-JSON error body — fall back to a generic message below
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return res.status === 204 ? null : res.json();
}

// Append a query string, skipping undefined/null params.
function withQuery(path, params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return path;
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
  return `${path}?${qs}`;
}

// --- Users ---
// Creating a profile is the one call that doesn't carry an X-User-Id yet.
export function createUser(payload) {
  return request('/users', { method: 'POST', body: payload, auth: false });
}

export function getMe() {
  return request('/users/me');
}

// All profiles on the server. Used to recover an existing account when the
// browser has no stored profile (e.g. localStorage was cleared). Not user-scoped,
// so it carries no X-User-Id header.
export function getUsers() {
  return request('/users', { auth: false });
}

export function updateUser(payload) {
  return request('/users/me', { method: 'PATCH', body: payload });
}

// --- Reads ---
// Minutes east of UTC, so the backend buckets streaks/heatmap days by the
// user's local calendar instead of UTC.
const tzOffset = () => -new Date().getTimezoneOffset();
export const getStats = () => request(withQuery('/stats', { tzOffset: tzOffset() }));
// Daily review counts for the dashboard heatmap ({ startDate, endDate, days }).
export const getActivity = (weeks) =>
  request(withQuery('/stats/activity', { weeks, tzOffset: tzOffset() }));
export const getTopics = () => request('/topics');
// Template library: nested patterns → variations (user-scoped).
export const getTemplates = () => request('/templates');
export const createPattern = (body) => request('/templates', { method: 'POST', body });
export const updatePattern = (id, body) =>
  request(`/templates/${id}`, { method: 'PATCH', body });
export const deletePattern = (id) => request(`/templates/${id}`, { method: 'DELETE' });
// Persist a new pattern order; `ids` is the full list top-to-bottom.
export const reorderPatterns = (ids) =>
  request('/templates/reorder', { method: 'POST', body: { ids } });
// Persist a new variation order within one pattern; `ids` top-to-bottom.
export const reorderVariations = (patternId, ids) =>
  request(`/templates/${patternId}/variations/reorder`, { method: 'POST', body: { ids } });
export const getProblems = (params) => request(withQuery('/problems', params));
export const getProblem = (id) => request(`/problems/${id}`);
// Grading history for one problem (oldest first) — the revision-history panel.
export const getProblemReviews = (id) => request(`/problems/${id}/reviews`);
export const getFlashcards = (params) => request(withQuery('/flashcards', params));

// --- Writes ---
export const createProblem = (body) => request('/problems', { method: 'POST', body });
export const updateProblem = (id, body) =>
  request(`/problems/${id}`, { method: 'PATCH', body });
export const deleteProblem = (id) => request(`/problems/${id}`, { method: 'DELETE' });
export const reviewProblem = (id, grade) =>
  request(`/problems/${id}/review`, { method: 'POST', body: { grade } });
export const reviewFlashcard = (id, grade) =>
  request(`/flashcards/${id}/review`, { method: 'POST', body: { grade } });

// --- LeetCode Questions ---

export function searchLeetCodeQuestions({ q, difficulty, tag, curriculum, page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (difficulty && difficulty !== 'All') params.append('difficulty', difficulty);
  if (tag && tag !== 'All') params.append('tag', tag);
  if (curriculum && curriculum !== 'All') params.append('curriculum', curriculum);
  params.append('page', page);
  params.append('limit', limit);
  return request(`/leetcode-questions?${params.toString()}`);
}

export function getLeetCodeQuestion(id) {
  return request(`/leetcode-questions/${id}`);
}

export function importLeetCodeQuestion(id) {
  return request(`/leetcode-questions/${id}/import`, { method: 'POST' });
}

// Sync solved problems from a LeetCode account. Pass { username } for a
// recent-submissions sync, or { sessionCookie } (the browser's
// LEETCODE_SESSION value — sent once, never stored) for the full history.
export function syncLeetCode(body) {
  return request('/leetcode/sync', { method: 'POST', body });
}

// --- Curriculums / Study Playlists ---
export const getCurriculums = () => request('/curriculums');
export const createCurriculum = (body) => request('/curriculums', { method: 'POST', body });
export const getCurriculum = (idOrSlug) => request(`/curriculums/${idOrSlug}`);
export const deleteCurriculum = (id) => request(`/curriculums/${id}`, { method: 'DELETE' });
export const addQuestionsToCurriculum = (curriculumId, questionIds) =>
  request(`/curriculums/${curriculumId}/questions`, { method: 'POST', body: { questionIds } });
export const removeQuestionFromCurriculum = (curriculumId, leetcodeId) =>
  request(`/curriculums/${curriculumId}/questions/${leetcodeId}`, { method: 'DELETE' });


// --- Custom Lists (Playlists) ---
export const getCustomLists = () => request('/custom-lists');
export const createCustomList = (body) => request('/custom-lists', { method: 'POST', body });
export const getCustomList = (id) => request(`/custom-lists/${id}`);
export const updateCustomList = (id, body) => request(`/custom-lists/${id}`, { method: 'PATCH', body });
export const deleteCustomList = (id) => request(`/custom-lists/${id}`, { method: 'DELETE' });
export const addProblemsToCustomList = (listId, problemIds) =>
  request(`/custom-lists/${listId}/problems`, { method: 'POST', body: { problemIds } });
export const removeProblemFromCustomList = (listId, problemId) =>
  request(`/custom-lists/${listId}/problems/${problemId}`, { method: 'DELETE' });
export const removeProblemsFromCustomList = (listId, problemIds) =>
  request(`/custom-lists/${listId}/problems/remove`, { method: 'POST', body: { problemIds } });


