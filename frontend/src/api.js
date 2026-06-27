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

// --- Users ---
// Creating a profile is the one call that doesn't carry an X-User-Id yet.
export function createUser(payload) {
  return request('/users', { method: 'POST', body: payload, auth: false });
}

export function getMe() {
  return request('/users/me');
}

export function updateUser(payload) {
  return request('/users/me', { method: 'PATCH', body: payload });
}
