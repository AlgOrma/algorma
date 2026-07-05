# AlgOrma — Frontend

React 19 + Vite + Tailwind CSS v4, linted with oxlint. See the
[root README](../README.md) for full setup and how the UI connects to the API.

```bash
npm install
npm run dev       # dev server at http://localhost:5199
npm run lint      # oxlint
npm run build     # production build to dist/
```

Optional config: copy `.env.example` to `.env` to override `VITE_API_URL`
(defaults to `http://localhost:8000/api`, see `src/api.js`).
