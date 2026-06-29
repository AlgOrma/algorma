// Tiny fetch client for the AlgOrma API.
//
// The backend has no auth: it identifies the current profile from an
// `X-User-Id` header. We keep the single source of truth in localStorage under
// `dsa_user` (the full profile object, persisted by App's useLocalStorage), and
// read the id back out of it for every request.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const USER_KEY = 'dsa_user';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Current profile id, read from the persisted user object (or null on first run).
export function currentUserId() {
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
export const getStats = () => request('/stats');
export const getTopics = () => request('/topics');
// Template library: nested patterns → variations (user-scoped).
export const getTemplates = () => request('/templates');
export const createPattern = (body) => request('/templates', { method: 'POST', body });
export const updatePattern = (id, body) =>
  request(`/templates/${id}`, { method: 'PATCH', body });
export const deletePattern = (id) => request(`/templates/${id}`, { method: 'DELETE' });
export const getProblems = (params) => request(withQuery('/problems', params));
export const getProblem = (id) => request(`/problems/${id}`);
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

export function searchLeetCodeQuestions({ q, difficulty, tag, page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (difficulty && difficulty !== 'All') params.append('difficulty', difficulty);
  if (tag && tag !== 'All') params.append('tag', tag);
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
