# AlgOrma — Frontend

React 19 + Vite + Tailwind CSS v4, linted with oxlint. See the
[root README](../README.md) for full setup and how the UI connects to the API.

```bash
npm install
npm run dev       # dev server at http://localhost:5199
npm run lint      # oxlint
npm test          # vitest (jsdom + Testing Library; see src/test/setup.js)
npm run test:watch
npm run build     # production build to dist/
```

Tests live next to what they cover (`src/api.test.js`,
`src/components/common/*.test.jsx`, …) and run in jsdom with mocked `fetch` —
no backend needed.

Optional config: copy `.env.example` to `.env` to override `VITE_API_URL`
(defaults to `http://localhost:8000/api`, see `src/api.js`).
