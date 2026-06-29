import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// One-time cleanup: earlier builds seeded sample problems/cards/topics straight
// into localStorage, so existing browsers keep showing that stale data even
// after the seed arrays were emptied. Purge those legacy keys once (gated by a
// flag) — this runs before the app reads localStorage, so it starts empty and
// never touches anything the user creates afterwards.
if (localStorage.getItem('dsa_seed_cleared_v1') !== '1') {
  ['dsa_problems', 'dsa_cards', 'dsa_topics', 'dsa_selected_id', 'dsa_streak'].forEach(
    (key) => localStorage.removeItem(key)
  )
  localStorage.setItem('dsa_seed_cleared_v1', '1')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
