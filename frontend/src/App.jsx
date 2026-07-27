import React, { useState, useEffect, useMemo, useRef } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import * as api from './api';
import Sidebar from './components/Sidebar';
import Button from './components/common/Button';
import Dashboard from './pages/Dashboard';
import ProblemBank from './pages/ProblemBank';
import Templates from './pages/Templates';
import ProblemDetail from './pages/ProblemDetail';
import RevisionSession from './pages/RevisionSession';
import FlashcardSession from './pages/FlashcardSession';
import ProfileSetup from './pages/ProfileSetup';
import Auth from './pages/Auth';
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
  // Nothing writes these during normal use (cards are graded via the API once
  // flashcards ship, the streak comes from the backend heatmap, and there's no
  // theme switcher yet) — the setters exist only for the per-user reset below.
  const [cards, setCards] = useLocalStorage('dsa_cards', INITIAL_CARDS);
  const [streakDays, setStreakDays] = useLocalStorage('dsa_streak', 0);
  const [theme] = useLocalStorage('dsa_theme', 'blue'); // 'blue' or 'purple'
  const [user, setUser] = useLocalStorage('dsa_user', null);
  // With auth on, nothing renders until the first getMe() settles, so a valid
  // session never flashes the login screen (and vice versa). The legacy flow
  // has no such gate.
  const [authChecked, setAuthChecked] = useState(!FEATURES.auth);

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

  // Auth on: the session cookie decides who we are. getMe() succeeding
  // refreshes the cached profile, a 401 means logged out. The locally cached
  // user is never trusted on its own.
  //
  // An unreachable API (ApiError status 0) is deliberately *not* treated as
  // logged out: a valid cookie plus a backend blip would otherwise dump the
  // user on the login screen, where logging in fails too — a dead end that
  // reads as "my account broke". Show a retry instead and re-run the check.
  const [sessionUnreachable, setSessionUnreachable] = useState(false);
  const checkSession = React.useCallback(() => {
    setAuthChecked(false);
    setSessionUnreachable(false);
    api.getMe()
      .then((fresh) => setUser(fresh))
      .catch((err) => {
        if (err?.status === 0) setSessionUnreachable(true);
        else setUser(null);
      })
      .finally(() => setAuthChecked(true));
    // setUser is a stable useState setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On load, reconcile the profile with the backend.
  //
  // Legacy (auth off): a locally stored profile has its fields refreshed, or —
  // if the server doesn't know that id (e.g. an old client-only profile) — is
  // cleared so first-run setup runs again. Network/other errors are ignored so
  // the app still works offline.
  useEffect(() => {
    if (FEATURES.auth) {
      checkSession();
      return;
    }
    if (user?.id) {
      api.getMe()
        .then((fresh) => setUser(fresh))
        .catch((err) => {
          if (err?.status === 404) setUser(null);
        });
    }
    // Runs once on mount; setUser is stable and user is only the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session expiry mid-use: any 401 on a session-backed call routes back to
  // the login screen.
  useEffect(() => {
    if (!FEATURES.auth) return undefined;
    api.setOnUnauthorized(() => setUser(null));
    return () => api.setOnUnauthorized(null);
    // setUser is a stable useState setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End the server-side session; drop to the login screen regardless (a dead
  // session should never trap the user in the app shell).
  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* session already gone (expired or server unreachable) — proceed */
    } finally {
      setUser(null);
    }
  };

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

  // Save profile edits. Persists to the backend; throws to the caller
  // (ProfileSetup) on failure so it can surface it. Account *creation* is
  // /auth/register's job — there is no unauthenticated profile-create endpoint
  // any more.
  const handleSaveProfile = async (formPayload) => {
    const saved = await api.updateUser(formPayload);
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

  // Clear the previous user's data the moment the user changes (logout or
  // switch), so a failed or slow refetch never shows another user's problems,
  // lists, templates, or mastery to whoever logs in next.
  useEffect(() => {
    setServerTopics(null);
    setProblems([]);
    setCustomLists([]);
    setTemplatePatterns([]);
    setRevisionProblems(null);
    // Otherwise a session that expires with the profile editor open drops the
    // next user straight into it instead of the dashboard.
    setIsEditingProfile(false);
  }, [user?.id]);

  // Same idea for the client state we persist: `dsa_screen`, `dsa_selected_id`,
  // `dsa_streak` and `dsa_cards` are per-user, so without this the next person
  // to log in on this browser inherits the previous one's landing screen,
  // selected problem and streak. `dsa_theme` is a device preference and stays.
  //
  // Compared against the last *signed-in* id, not the live `user?.id`, because
  // every account change routes through null — logout, an expired session, a
  // page load — so a null→X transition on its own can't tell "someone else
  // logged in" from "the same person re-authenticated". Holding the previous
  // account across the null (and across a reload, hence localStorage rather
  // than a ref) keeps a re-login a no-op, so a session that expires on
  // /problems/<id> comes back to that problem instead of the dashboard, while
  // A→B still resets. Logout records nothing: the account that was signed in
  // stays the one to compare the next login against.
  const [lastUserId, setLastUserId] = useLocalStorage('dsa_last_user_id', null);
  useEffect(() => {
    const nextId = user?.id ?? null;
    if (nextId === null || nextId === lastUserId) return;
    const switchedAccounts = lastUserId !== null;
    setLastUserId(nextId);
    // First account this browser has seen: there's no earlier user's state to
    // clear, and resetting here would clobber the remembered screen (and the
    // deep link the URL effect just adopted) on an ordinary page load.
    if (!switchedAccounts) return;
    setScreen('dashboard');
    setSelectedId(null);
    setStreakDays(0);
    setCards(INITIAL_CARDS);
    // The setters are stable, and `lastUserId` is only ever written here, so
    // the closure always sees the value from the render that changed the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Blank (black, matching the app shell) while the session check is in
  // flight, then the login / sign-up screen until the server knows who we are.
  if (FEATURES.auth && !authChecked) {
    return <div className="h-screen bg-bg-main" />;
  }
  // Couldn't tell whether the session is valid — offer a retry rather than the
  // login screen, which would only fail again against the same dead backend.
  if (FEATURES.auth && sessionUnreachable) {
    return (
      <div className="h-screen bg-bg-main text-text-main overflow-hidden flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="font-mono text-fs-12 text-text-muted">
          Can’t reach the server. Check your connection, then try again.
        </div>
        <Button variant="primary" onClick={checkSession}>
          Retry
        </Button>
      </div>
    );
  }
  if (FEATURES.auth && !user) {
    return (
      <div
        className="h-screen bg-bg-main text-text-main overflow-hidden"
        style={{
          '--theme-accent': themeAccent,
          '--theme-secondary': themeSecondary
        }}
      >
        <Auth onAuthed={setUser} />
      </div>
    );
  }

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
        onLogout={FEATURES.auth ? handleLogout : undefined}
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
