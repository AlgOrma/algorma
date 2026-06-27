// Thin client for the AlgOrma FastAPI backend.
// Base URL comes from VITE_API_URL (see frontend/.env).

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${res.status}`);
  }
  // 204 No Content (e.g. DELETE) has no body.
  return res.status === 204 ? null : res.json();
}

function withQuery(path, params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return path;
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
  return `${path}?${qs}`;
}

// --- reads ---
export const getStats = () => request('/stats');
export const getTopics = () => request('/topics');
export const getTemplates = () => request('/templates');
export const getProblems = (params) => request(withQuery('/problems', params));
export const getProblem = (id) => request(`/problems/${id}`);
export const getFlashcards = (params) => request(withQuery('/flashcards', params));

// --- writes ---
export const createProblem = (body) =>
  request('/problems', { method: 'POST', body: JSON.stringify(body) });
export const updateProblem = (id, body) =>
  request(`/problems/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteProblem = (id) => request(`/problems/${id}`, { method: 'DELETE' });
export const reviewProblem = (id, grade) =>
  request(`/problems/${id}/review`, { method: 'POST', body: JSON.stringify({ grade }) });
export const reviewFlashcard = (id, grade) =>
  request(`/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ grade }) });
