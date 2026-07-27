// Shared Vitest setup: jest-dom matchers + React Testing Library cleanup.
// Tests import describe/it/expect from 'vitest' explicitly (globals are off).
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Node 22+ pre-defines an (undefined) localStorage on globalThis, which stops
// Vitest from copying jsdom's real Storage onto the test global. Bridge it
// from the jsdom handle Vitest exposes.
for (const key of ['localStorage', 'sessionStorage']) {
  if (typeof globalThis[key] === 'undefined' && globalThis.jsdom) {
    Object.defineProperty(globalThis, key, {
      value: globalThis.jsdom.window[key],
      configurable: true,
    });
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
