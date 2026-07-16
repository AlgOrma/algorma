// Tests for the fetch client in src/api.js. `fetch` is the only mocked
// boundary; everything else runs for real against jsdom's localStorage.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  currentUserId,
  createUser,
  getUsers,
  getMe,
  updateUser,
  getActivity,
  searchLeetCodeQuestions,
  deleteProblem,
} from './api';

const USER = { id: 'user-42', name: 'Vee' };

function storeUser(user = USER) {
  localStorage.setItem('dsa_user', JSON.stringify(user));
}

const okJson = (data, status = 200) => ({
  ok: true,
  status,
  json: () => Promise.resolve(data),
});

const errJson = (data, status) => ({
  ok: false,
  status,
  json: () => Promise.resolve(data),
});

const errNonJson = (status) => ({
  ok: false,
  status,
  json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
});

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okJson({}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Parse the URL of the nth fetch call. The extra base makes this robust even
// if VITE_API_URL were a relative path — we only ever assert on the path/query.
function calledUrl(callIndex = 0) {
  return new URL(fetchMock.mock.calls[callIndex][0], 'http://base.invalid');
}

function calledOptions(callIndex = 0) {
  return fetchMock.mock.calls[callIndex][1];
}

describe('currentUserId', () => {
  it('returns the id stored in the dsa_user profile object', () => {
    storeUser({ id: 'abc-123', name: 'Someone' });
    expect(currentUserId()).toBe('abc-123');
  });

  it('returns null when no profile is stored', () => {
    expect(currentUserId()).toBeNull();
  });

  it('returns null when the stored value is corrupt JSON', () => {
    localStorage.setItem('dsa_user', '{not valid json!');
    expect(currentUserId()).toBeNull();
  });

  it('returns null when the stored profile has no id', () => {
    localStorage.setItem('dsa_user', JSON.stringify({ name: 'No Id' }));
    expect(currentUserId()).toBeNull();
  });
});

describe('request headers', () => {
  it('sends the X-User-Id header when a profile is stored', async () => {
    storeUser();
    await getMe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl().pathname).toMatch(/\/users\/me$/);
    expect(calledOptions().headers['X-User-Id']).toBe('user-42');
  });

  it('omits the X-User-Id header when no profile is stored', async () => {
    await getMe();

    expect(calledOptions().headers).not.toHaveProperty('X-User-Id');
  });

  it('omits the X-User-Id header for createUser even when a profile is stored', async () => {
    storeUser();
    await createUser({ name: 'New Person' });

    expect(calledUrl().pathname).toMatch(/\/users$/);
    expect(calledOptions().method).toBe('POST');
    expect(calledOptions().headers).not.toHaveProperty('X-User-Id');
  });

  it('omits the X-User-Id header for getUsers even when a profile is stored', async () => {
    storeUser();
    await getUsers();

    expect(calledUrl().pathname).toMatch(/\/users$/);
    expect(calledOptions().headers).not.toHaveProperty('X-User-Id');
  });

  it('sets Content-Type: application/json on every request', async () => {
    await getUsers();
    await createUser({ name: 'A' });

    expect(calledOptions(0).headers['Content-Type']).toBe('application/json');
    expect(calledOptions(1).headers['Content-Type']).toBe('application/json');
  });
});

describe('request bodies', () => {
  it('JSON-encodes the body for writes', async () => {
    const payload = { name: 'Vee', theme: 'dark' };
    await createUser(payload);

    expect(calledOptions().body).toBe(JSON.stringify(payload));
  });

  it('sends PATCH with a JSON body for updateUser', async () => {
    storeUser();
    await updateUser({ name: 'Renamed' });

    expect(calledUrl().pathname).toMatch(/\/users\/me$/);
    expect(calledOptions().method).toBe('PATCH');
    expect(calledOptions().body).toBe(JSON.stringify({ name: 'Renamed' }));
  });

  it('sends no body for GET requests', async () => {
    await getMe();

    expect(calledOptions().body).toBeUndefined();
  });
});

describe('error handling', () => {
  it('throws an ApiError carrying the detail message and status from a JSON error body', async () => {
    fetchMock.mockResolvedValue(errJson({ detail: 'User not found' }, 404));

    const err = await getMe().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('User not found');
    expect(err.status).toBe(404);
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(errNonJson(500));

    const err = await getMe().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Request failed (500)');
    expect(err.status).toBe(500);
  });

  it('falls back to a generic message when the JSON error body has no detail', async () => {
    fetchMock.mockResolvedValue(errJson({ error: 'nope' }, 422));

    const err = await getMe().catch((e) => e);
    expect(err.message).toBe('Request failed (422)');
    expect(err.status).toBe(422);
  });

  it('throws a status-0 "cannot reach the server" ApiError when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const err = await getMe().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toBe('Cannot reach the server. Is the API running?');
  });
});

describe('responses', () => {
  it('resolves with the parsed JSON body on success', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'u1', name: 'Vee' }));

    await expect(getMe()).resolves.toEqual({ id: 'u1', name: 'Vee' });
  });

  it('resolves to null on a 204 response without reading the body', async () => {
    const json = vi.fn().mockRejectedValue(new SyntaxError('no body'));
    fetchMock.mockResolvedValue({ ok: true, status: 204, json });
    storeUser();

    await expect(deleteProblem('p1')).resolves.toBeNull();
    expect(calledUrl().pathname).toMatch(/\/problems\/p1$/);
    expect(calledOptions().method).toBe('DELETE');
    expect(json).not.toHaveBeenCalled();
  });
});

describe('query building', () => {
  it('getActivity skips the weeks param when undefined but still sends tzOffset', async () => {
    await getActivity(undefined);

    const url = calledUrl();
    expect(url.pathname).toMatch(/\/stats\/activity$/);
    expect(url.searchParams.has('weeks')).toBe(false);
    expect(url.searchParams.has('tzOffset')).toBe(true);
  });

  it('getActivity includes weeks when provided', async () => {
    await getActivity(26);

    expect(calledUrl().searchParams.get('weeks')).toBe('26');
  });

  it('getActivity sends tzOffset as minutes east of UTC (negated getTimezoneOffset)', async () => {
    // Date#getTimezoneOffset reports minutes *west* of UTC (UTC+5:30 → -330),
    // but the backend buckets heatmap/streak days by minutes *east*, so the
    // client must negate it. A sign flip here silently shifts day boundaries.
    const spy = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330);
    try {
      await getActivity(4);
    } finally {
      spy.mockRestore();
    }

    expect(calledUrl().searchParams.get('tzOffset')).toBe('330');
  });

  it('searchLeetCodeQuestions sends only page/limit defaults when called with no args', async () => {
    await searchLeetCodeQuestions();

    const url = calledUrl();
    expect(url.pathname).toMatch(/\/leetcode-questions$/);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('50');
    expect([...url.searchParams.keys()].sort()).toEqual(['limit', 'page']);
  });

  it("searchLeetCodeQuestions drops filters set to 'All'", async () => {
    await searchLeetCodeQuestions({ difficulty: 'All', tag: 'All', curriculum: 'All' });

    const url = calledUrl();
    expect(url.searchParams.has('difficulty')).toBe(false);
    expect(url.searchParams.has('tag')).toBe(false);
    expect(url.searchParams.has('curriculum')).toBe(false);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('50');
  });

  it('searchLeetCodeQuestions includes real filters, search text, and custom paging', async () => {
    await searchLeetCodeQuestions({
      q: 'two sum',
      difficulty: 'Easy',
      tag: 'Array',
      curriculum: 'neetcode-150',
      page: 3,
      limit: 25,
    });

    const url = calledUrl();
    expect(url.searchParams.get('q')).toBe('two sum');
    expect(url.searchParams.get('difficulty')).toBe('Easy');
    expect(url.searchParams.get('tag')).toBe('Array');
    expect(url.searchParams.get('curriculum')).toBe('neetcode-150');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('limit')).toBe('25');
  });
});
