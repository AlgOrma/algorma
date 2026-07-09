import React, { useState, useEffect, useMemo, useRef } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import * as api from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ProblemBank from './pages/ProblemBank';
import Templates from './pages/Templates';
import ProblemDetail from './pages/ProblemDetail';
import RevisionSession from './pages/RevisionSession';
import FlashcardSession from './pages/FlashcardSession';
import ProfileSetup from './pages/ProfileSetup';
import LeetCodeLibrary from './pages/LeetCodeLibrary';
import CustomLists from './pages/CustomLists';
import { FEATURES } from './features';

import { INITIAL_CARDS } from './data/initialData';

// URL path for each screen, so pages are shareable endpoints (e.g. /revise).
// Feature-flagged screens are left out entirely, so their URLs don't resolve.
const SCREEN_PATHS = {
  dashboard: '/dashboard',
  problems: '/problems',
  leetcode: '/leetcode',
  'custom-lists': '/custom-lists',
  templates: '/templates',
  revise: '/revise',
  ...(FEATURES.flashcards ? { flashcards: '/flashcards' } : {})
};

// '/problems/<id>' opens that problem's detail screen directly.
// '/revise/<id>' lands on the revision screen (RevisionSession reads the id
// itself and starts a session for that problem).
function screenFromPath(pathname) {
  const detailMatch = pathname.match(/^\/problems\/([^/]+)$/);
  if (detailMatch) return { screen: 'detail', id: detailMatch[1] };
  if (/^\/revise\/[^/]+$/.test(pathname)) return { screen: 'revise', id: null };
  const entry = Object.entries(SCREEN_PATHS).find(([, path]) => path === pathname);
  return entry ? { screen: entry[0], id: null } : null;
}

function pathForScreen(screen, selectedId) {
  if (screen === 'detail' && selectedId) return `/problems/${selectedId}`;
  return SCREEN_PATHS[screen] || '/dashboard';
}

function App() {
  // Persistent client-side state
  const [screen, setScreen] = useLocalStorage('dsa_screen', 'dashboard');
  const [selectedId, setSelectedId] = useLocalStorage('dsa_selected_id', null);
  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [customLists, setCustomLists] = useState([]);
  const [customListsLoading, setCustomListsLoading] = useState(true);
  // Read-only for now: cards are graded via the API once flashcards ship, the
  // streak comes from the backend heatmap, and there's no theme switcher yet.
  const [cards] = useLocalStorage('dsa_cards', INITIAL_CARDS);
  const [streakDays] = useLocalStorage('dsa_streak', 0);
  const [theme] = useLocalStorage('dsa_theme', 'blue'); // 'blue' or 'purple'
  const [user, setUser] = useLocalStorage('dsa_user', null);

  // A feature-flagged-off screen can still be remembered in localStorage from
  // before the flag flipped — fall back to the dashboard.
  useEffect(() => {
    if (!FEATURES.flashcards && screen === 'flashcards') setScreen('dashboard');
    // setScreen is a stable useState setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // On first render, the URL wins over the remembered screen so direct links
  // like /revise or /problems/<id> land on the right page (render-phase update,
  // before anything paints).
  const adoptedUrlRef = useRef(false);
  if (!adoptedUrlRef.current) {
    adoptedUrlRef.current = true;
    const fromUrl = screenFromPath(window.location.pathname);
    if (fromUrl) {
      if (fromUrl.screen !== screen) setScreen(fromUrl.screen);
      if (fromUrl.id && fromUrl.id !== selectedId) setSelectedId(fromUrl.id);
    }
  }

  // Keep the address bar in sync with the active screen. The first sync
  // replaces the history entry (so '/' doesn't linger); later ones push,
  // making the browser back/forward buttons work.
  const urlInitializedRef = useRef(false);
  useEffect(() => {
    const path = pathForScreen(screen, selectedId);
    // Leave subpaths owned by the active screen alone (e.g. /revise/<id>,
    // which RevisionSession manages itself).
    const current = screenFromPath(window.location.pathname);
    const onSameScreen =
      current && current.screen === screen && (screen !== 'detail' || current.id === selectedId);
    if (!onSameScreen && window.location.pathname !== path) {
      if (urlInitializedRef.current) {
        window.history.pushState(null, '', path);
      } else {
        window.history.replaceState(null, '', path);
      }
    }
    urlInitializedRef.current = true;
  }, [screen, selectedId]);

  // Browser back/forward → restore the screen for that history entry.
  useEffect(() => {
    const handlePopState = () => {
      const fromUrl = screenFromPath(window.location.pathname) || { screen: 'dashboard', id: null };
      setScreen(fromUrl.screen);
      if (fromUrl.id) setSelectedId(fromUrl.id);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // setScreen/setSelectedId are stable useState setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load problems from the backend database (user-scoped)
  const loadProblems = React.useCallback(() => {
    if (!user?.id) {
      setProblemsLoading(false);
      return;
    }
    setProblemsLoading(true);
    api.getProblems()
      .then((data) => {
        setProblems(data || []);
      })
      .catch((err) => {
        console.warn('Could not load problems from backend:', err.message);
      })
      .finally(() => setProblemsLoading(false));
  }, [user?.id]);

  useEffect(() => {
    loadProblems();
  }, [loadProblems]);

  // Load custom lists from the backend database (user-scoped)
  const loadCustomLists = React.useCallback(() => {
    if (!user?.id) {
      setCustomListsLoading(false);
      return;
    }
    setCustomListsLoading(true);
    api.getCustomLists()
      .then((data) => {
        setCustomLists(data || []);
      })
      .catch((err) => {
        console.warn('Could not load custom lists from backend:', err.message);
      })
      .finally(() => setCustomListsLoading(false));
  }, [user?.id]);

  useEffect(() => {
    loadCustomLists();
  }, [loadCustomLists]);


  // Template library: a two-level, user-editable set of patterns + code
  // variations, owned by the backend. Loaded per-user from the API; the server
  // seeds a starter library for new profiles (and lazily on first fetch).
  const [templatePatterns, setTemplatePatterns] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Temporary UI state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [initialSearchQuery, setInitialSearchQuery] = useState('');

  // Theme settings mapping
  const themeAccent = theme === 'blue' ? '#0070F3' : '#7928CA';
  const themeSecondary = theme === 'blue' ? '#0051CB' : '#4D1A80';

  // State to hold specific problems forced for revision
  const [revisionProblems, setRevisionProblems] = useState(null);

  // Navigation controller
  const handleNavigate = (targetScreen, params = {}) => {
    if (params.query !== undefined) {
      setInitialSearchQuery(params.query);
    } else {
      setInitialSearchQuery('');
    }
    if (targetScreen !== 'revise') {
      setRevisionProblems(null);
    }
    setScreen(targetScreen);
  };

  // Helper to start revision for selected problems
  const handleStartRevision = (selectedProblems) => {
    setRevisionProblems(selectedProblems);
    setScreen('revise');
  };

  // Open problem detail
  const handleOpenProblem = (id) => {
    setSelectedId(id);
    setScreen('detail');
  };

  // On load, reconcile the profile with the backend. Two cases:
  //  - A profile is stored locally: refresh its fields, or — if the server
  //    doesn't know that id (e.g. an old client-only profile) — clear it so
  //    first-run setup runs again.
  //  - No profile stored (e.g. localStorage was cleared): the backend has no
  //    auth, so recover an existing account instead of forcing re-onboarding —
  //    adopt the first profile the server knows about. Onboarding only shows
  //    when the server genuinely has no users.
  // Network/other errors are ignored so the app still works offline.
  useEffect(() => {
    if (user?.id) {
      api.getMe()
        .then((fresh) => setUser(fresh))
        .catch((err) => {
          if (err?.status === 404) setUser(null);
        });
    } else {
      api.getUsers()
        .then((users) => {
          if (users?.length) setUser(users[0]);
        })
        .catch(() => {
          /* offline or no server — fall through to onboarding */
        });
    }
    // Runs once on mount; setUser is stable and user is only the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the template library once we know the current profile (templates are
  // user-scoped). On failure (offline / no server) we fall back to an empty
  // library so the page still renders.
  useEffect(() => {
    if (!user?.id) {
      setTemplatesLoading(false);
      return;
    }
    setTemplatesLoading(true);
    api.getTemplates()
      .then((rows) => setTemplatePatterns(rows || []))
      .catch((err) => console.warn('Could not load templates:', err.message))
      .finally(() => setTemplatesLoading(false));
  }, [user?.id]);

  // Template mutations go through the API; on success we update local state from
  // the server's response (which carries the canonical ids and ordering).
  const handleCreatePattern = async (draft) => {
    const created = await api.createPattern(draft);
    setTemplatePatterns((prev) => [created, ...prev]);
    return created;
  };

  const handleUpdatePattern = async (id, draft) => {
    const updated = await api.updatePattern(id, draft);
    setTemplatePatterns((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const handleDeletePattern = async (id) => {
    await api.deletePattern(id);
    setTemplatePatterns((prev) => prev.filter((p) => p.id !== id));
  };

  // Reorder optimistically, then persist. On failure we restore the prior order.
  const handleReorderPatterns = async (orderedIds) => {
    const prev = templatePatterns;
    const byId = new Map(prev.map((p) => [p.id, p]));
    const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    setTemplatePatterns(next);
    try {
      await api.reorderPatterns(orderedIds);
    } catch (err) {
      console.warn('Could not save new order:', err.message);
      setTemplatePatterns(prev);
    }
  };

  // Reorder one pattern's variations, optimistically then persisted.
  const handleReorderVariations = async (patternId, orderedVarIds) => {
    const prev = templatePatterns;
    setTemplatePatterns((cur) =>
      cur.map((p) => {
        if (p.id !== patternId) return p;
        const byId = new Map(p.variations.map((v) => [v.id, v]));
        const variations = orderedVarIds.map((id) => byId.get(id)).filter(Boolean);
        return { ...p, variations };
      })
    );
    try {
      const updated = await api.reorderVariations(patternId, orderedVarIds);
      setTemplatePatterns((cur) => cur.map((p) => (p.id === patternId ? updated : p)));
    } catch (err) {
      console.warn('Could not save variation order:', err.message);
      setTemplatePatterns(prev);
    }
  };

  // Save profile from first-run setup or the edit-profile screen. Persists to the
  // backend; throws to the caller (ProfileSetup) on failure so it can surface it.
  const handleSaveProfile = async (formPayload) => {
    const saved = user?.id
      ? await api.updateUser(formPayload)
      : await api.createUser(formPayload);
    setUser(saved);
    setIsEditingProfile(false);
  };

  // Sync a single problem into local state (server already has the change)
  const applyProblemUpdate = (updatedProblem) => {
    setProblems(prevProblems =>
      prevProblems.map(p => (p.id === updatedProblem.id ? updatedProblem : p))
    );
  };

  // Update a single problem in local state and database
  const handleUpdateProblem = async (updatedProblem) => {
    try {
      const res = await api.updateProblem(updatedProblem.id, updatedProblem);
      applyProblemUpdate(res);
    } catch (err) {
      console.error('Failed to update problem in database:', err.message);
    }
  };

  // Delete one or more problems
  const handleDeleteProblems = async (ids) => {
    try {
      await Promise.all(ids.map(id => api.deleteProblem(id)));
      setProblems(prevProblems => prevProblems.filter(p => !ids.includes(p.id)));
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
        setScreen('problems');
      }
    } catch (err) {
      console.error('Failed to delete problem(s):', err.message);
    }
  };

  // Add a problem imported from the LeetCode library (already created on the
  // backend) to local state.
  const handleSaveProblem = (newProblem) => {
    setProblems(prevProblems => [newProblem, ...prevProblems]);
  };

  // Topic mastery. The backend is the source of truth (/api/topics: solved out
  // of total per topic, so the bar always matches the fraction); refetched
  // whenever the problem list changes so status updates show up.
  const [serverTopics, setServerTopics] = useState(null);

  // Clear the previous user's mastery the moment the user changes (logout or
  // switch), so a failed or slow refetch never shows another user's data.
  useEffect(() => {
    setServerTopics(null);
  }, [user?.id]);

  // Refetch whenever the user or problem list changes. The cancelled flag drops
  // stale responses so rapid status toggles can't land out of order and leave
  // an older topic snapshot rendered.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    api.getTopics()
      .then((data) => { if (!cancelled) setServerTopics(data); })
      .catch((err) => {
        if (!cancelled) console.warn('Could not load topics:', err.message);
      });
    return () => { cancelled = true; };
  }, [user?.id, problems]);

  // Offline fallback: the same solved/total per topic, derived locally.
  const localTopics = useMemo(() => {
    const byTopic = new Map();
    for (const p of problems) {
      const name = p.topic || 'Other';
      const entry = byTopic.get(name) || { name, solved: 0, total: 0 };
      entry.total += 1;
      if (p.status === 'Done') entry.solved += 1;
      byTopic.set(name, entry);
    }
    return [...byTopic.values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map(({ name, solved, total }) => ({
        name,
        frac: `${solved}/${total}`,
        pct: Math.round((solved / total) * 100)
      }));
  }, [problems]);

  const topics = serverTopics ?? localTopics;

  // Helper to fetch current selected problem. No fallback: a stale deep link
  // (e.g. /problems/<deleted-id>) must show "not found", not a different problem.
  const currentProblem = problems.find(p => p.id === selectedId) || null;

  // Screen router rendering
  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':
        return (
          <Dashboard
            problems={problems}
            topics={topics}
            userName={user?.name}
            onNavigate={handleNavigate}
            onOpenProblem={handleOpenProblem}
            themeColor={themeAccent}
          />
        );
      case 'problems':
        return (
          <ProblemBank
            problems={problems}
            onOpenProblem={handleOpenProblem}
            onNewProblem={() => handleNavigate('leetcode')}
            onDeleteProblems={handleDeleteProblems}
            onReviseProblems={handleStartRevision}
            initialSearchQuery={initialSearchQuery}
            themeColor={themeAccent}
            customLists={customLists}
            onLoadCustomLists={loadCustomLists}
            onRefreshProblems={loadProblems}
          />
        );
      case 'leetcode':
        return (
          <LeetCodeLibrary
            problems={problems}
            onImportProblem={(newProblem) => {
              handleSaveProblem(newProblem);
              setSelectedId(newProblem.id);
              setScreen('detail');
            }}
            onSaveProblem={handleSaveProblem}
            customLists={customLists}
            onLoadCustomLists={loadCustomLists}
            onRefreshProblems={loadProblems}
            themeColor={themeAccent}
          />
        );
      case 'custom-lists':
        return (
          <CustomLists
            customLists={customLists}
            customListsLoading={customListsLoading}
            onLoadCustomLists={loadCustomLists}
            onStartRevision={handleStartRevision}
            onOpenProblem={handleOpenProblem}
          />
        );
      case 'templates':
        return (
          <Templates
            patterns={templatePatterns}
            loading={templatesLoading}
            onCreatePattern={handleCreatePattern}
            onUpdatePattern={handleUpdatePattern}
            onDeletePattern={handleDeletePattern}
            onReorderPatterns={handleReorderPatterns}
            onReorderVariations={handleReorderVariations}
          />
        );
      case 'detail':
        // Deep link may render before the problem list has loaded.
        if (!currentProblem && problemsLoading) {
          return (
            <div className="flex-1 flex items-center justify-center font-mono text-fs-12 text-text-muted">
              Loading problem…
            </div>
          );
        }
        return (
          <ProblemDetail
            problem={currentProblem}
            problems={problems}
            customLists={customLists}
            onLoadCustomLists={loadCustomLists}
            onRefreshProblems={loadProblems}
            onBack={() => setScreen('problems')}
            onUpdateProblem={handleUpdateProblem}
            onDeleteProblems={handleDeleteProblems}
            onReviseProblems={handleStartRevision}
          />
        );
      case 'revise':
        return (
          <RevisionSession
            problems={problems}
            onUpdateProblem={applyProblemUpdate}
            onNavigate={handleNavigate}
            customProblems={revisionProblems}
            themeColor={themeAccent}
          />
        );
      case 'flashcards':
        // Flag off: render nothing for the frame before the fallback effect
        // switches the screen to the dashboard.
        if (!FEATURES.flashcards) return null;
        return (
          <FlashcardSession
            cards={cards}
            onNavigate={handleNavigate}
            themeColor={themeAccent}
          />
        );
      default:
        return (
          <div className="p-[40px] text-text-muted">
            Screen "{screen}" not implemented.
          </div>
        );
    }
  };

  const dueReviseCount = problems.filter(p => p.due).length;

  // First-run setup: no profile yet, or the user chose to edit their profile.
  // Rendered full-screen without the sidebar, matching the design.
  if (!user || isEditingProfile) {
    return (
      <div
        className="h-screen bg-bg-main text-text-main overflow-hidden"
        style={{
          '--theme-accent': themeAccent,
          '--theme-secondary': themeSecondary
        }}
      >
        <ProfileSetup
          user={user}
          isEditing={isEditingProfile && !!user}
          onSubmit={handleSaveProfile}
          onCancel={() => setIsEditingProfile(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-screen bg-bg-main text-text-main overflow-hidden relative"
      style={{
        '--theme-accent': themeAccent,
        '--theme-secondary': themeSecondary
      }}
    >
      {/* Sidebar Navigation */}
      <Sidebar
        activeScreen={screen}
        onNavigate={handleNavigate}
        problemsCount={problems.length}
        customListsCount={customLists.length}
        templatesCount={templatePatterns.length}
        reviseCount={dueReviseCount}
        flashcardsCount={cards.length}
        streakDays={streakDays}
        user={user}
        onEditProfile={() => setIsEditingProfile(true)}
        themeColor={themeAccent}
        themeColorSecondary={themeSecondary}
      />

      {/* Main View Container */}
      <div className="flex-1 min-w-0 relative flex flex-col">
        {/* Dynamic screen output */}
        {renderScreen()}
      </div>
    </div>
  );
}

export default App;
