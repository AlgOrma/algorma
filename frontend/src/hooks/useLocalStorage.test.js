import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLocalStorage from './useLocalStorage';

describe('useLocalStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial value when the key is absent from storage', () => {
    const { result } = renderHook(() => useLocalStorage('missing-key', 'fallback'));

    expect(result.current[0]).toBe('fallback');
  });

  it('persists the initial value to storage on mount even before setValue is called', () => {
    renderHook(() => useLocalStorage('fresh-key', 42));

    expect(localStorage.getItem('fresh-key')).toBe('42');
  });

  it('reads and parses an existing stored value instead of the initial value', () => {
    localStorage.setItem('theme', JSON.stringify('dark'));

    const { result } = renderHook(() => useLocalStorage('theme', 'light'));

    expect(result.current[0]).toBe('dark');
  });

  it('updates state and persists JSON to storage when setValue is called', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));

    act(() => {
      result.current[1](5);
    });

    expect(result.current[0]).toBe(5);
    expect(localStorage.getItem('count')).toBe('5');
  });

  it('supports functional updates via setValue(prev => ...)', () => {
    const { result } = renderHook(() => useLocalStorage('count', 1));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(3);
    expect(localStorage.getItem('count')).toBe('3');
  });

  it('falls back to the initial value and warns when stored JSON is corrupt', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('settings', '{not valid json!!');

    const { result } = renderHook(() => useLocalStorage('settings', { sound: true }));

    expect(result.current[0]).toEqual({ sound: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('settings');
  });

  it('overwrites corrupt stored JSON with the initial value after mount', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('settings', '{not valid json!!');

    renderHook(() => useLocalStorage('settings', { sound: true }));

    expect(localStorage.getItem('settings')).toBe(JSON.stringify({ sound: true }));
  });

  it('warns and keeps state updates working when writing to storage throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useLocalStorage('quota', 'a'));

    // The mount-time write fails, but the hook renders and warns with the key.
    expect(result.current[0]).toBe('a');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('quota');

    act(() => {
      result.current[1]('b');
    });

    // State still updates even though persistence keeps failing.
    expect(result.current[0]).toBe('b');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps its value across re-renders', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('stable', 'first'));

    act(() => {
      result.current[1]('second');
    });
    rerender();

    expect(result.current[0]).toBe('second');
    expect(localStorage.getItem('stable')).toBe(JSON.stringify('second'));
  });

  it('round-trips objects through storage', () => {
    const profile = { name: 'Ada', tags: ['math', 'cs'], level: 3 };
    const { result } = renderHook(() => useLocalStorage('profile', {}));

    act(() => {
      result.current[1](profile);
    });

    expect(result.current[0]).toEqual(profile);
    expect(JSON.parse(localStorage.getItem('profile'))).toEqual(profile);

    const { result: fresh } = renderHook(() => useLocalStorage('profile', {}));
    expect(fresh.current[0]).toEqual(profile);
  });

  it('round-trips arrays through storage', () => {
    const items = [1, 'two', { three: 3 }, [4]];
    const { result } = renderHook(() => useLocalStorage('items', []));

    act(() => {
      result.current[1](items);
    });

    expect(result.current[0]).toEqual(items);
    expect(JSON.parse(localStorage.getItem('items'))).toEqual(items);

    const { result: fresh } = renderHook(() => useLocalStorage('items', []));
    expect(fresh.current[0]).toEqual(items);
  });
});
