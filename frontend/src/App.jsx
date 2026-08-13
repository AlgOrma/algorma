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
import FlashcardDeckManager from './pages/FlashcardDeckManager';
import FlashcardCardEditor from './pages/FlashcardCardEditor';
import ProfileSetup from './pages/ProfileSetup';
import LeetCodeLibrary from './pages/LeetCodeLibrary';
import CustomLists from './pages/CustomLists';
import { FEATURES, applyServerFeatures } from './features';
import { screenFromPath, pathForScreen } from './routes';

function App() {
  // Persistent client-side state
  const [screen, setScreen] = useLocalStorage('dsa_screen', 'dashboard');
  const [selectedId, setSelectedId] = useLocalStorage('dsa_selected_id', null);
  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsError, setProblemsError] = useState(false);
  const [customLists, setCustomLists] = useState([]);
  const [customListsLoading, setCustomListsLoading] = useState(true);
  const [theme] = useLocalStorage('dsa_theme', 'blue'); // 'blue' or 'purple'
  const [user, setUser] = useLocalStorage('dsa_user', null);

  // The backend gates flashcards at runtime too (ENABLE_FLASHCARDS), so narrow
  // our build-time flags to what it actually serves. Until it answers we keep
  // the build-time default — the two are normally in sync, and flickering the
  // nav off and back on would be worse than a brief optimistic render.
  const [serverFeaturesApplied, setServerFeaturesApplied] = useState(false);
  useEffect(() => {
    api.getFeatures()
      .then((flags) => {
        applyServerFeatures(flags);
        setServerFeaturesApplied(true);
      })
      .catch(() => {
        /* offline or older server — keep the build-time flags */
      });
  }, []);

  // A feature-flagged-off screen can still be remembered in localStorage from
  // before the flag flipped — fall back to the dashboard. Covers every
  // flashcards surface (flashcards, flashcards-study, flashcards-editor).
  // Re-runs once the server's flags land, in case they turn the feature off.
  useEffect(() => {
    if (!FEATURES.flashcards && screen.startsWith('flashcards')) setScreen('dashboard');
    // setScreen is a stable useState setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, serverFeaturesApplied]);

  // On first render, the URL wins over the remembered screen so direct links
  // like /revise or /problems/<id> land on the right page (render-phase update,
  // before anything paints).
  const adoptedUrlRef = useRef(false);
  const bootUrlRef = useRef(null);
  if (!adoptedUrlRef.current) {
    adoptedUrlRef.current = true;
    bootUrlRef.current = screenFromPath(window.location.pathname, window.location.search);
    const fromUrl = bootUrlRef.current;
    if (fromUrl) {
      if (fromUrl.screen !== screen) setScreen(fromUrl.screen);
      if (fromUrl.id && fromUrl.id !== selectedId) setSelectedId(fromUrl.id);
    }
  }
  // Whatever the first load's URL carried, for the flashcards state below to
  // seed from. Read once; later navigations go through handleNavigate.
  const bootUrl = bootUrlRef.current || {};

  // Seeded from the URL so a reload of /flashcards/study?deck=… or
  // /flashcards/editor?card=… resumes what the user was actually doing.
  const [studyDeckId, setStudyDeckId] = useState(
    bootUrl.screen === 'flashcards-study' ? bootUrl.deckId ?? null : null
  );
  const [editorCardId, setEditorCardId] = useState(
    bootUrl.screen === 'flashcards-editor' ? bootUrl.cardId ?? null : null
  );
  const [editorPresetDeckId, setEditorPresetDeckId] = useState(
    bootUrl.screen === 'flashcards-editor' ? bootUrl.deckId ?? null : null
  );

  // Keep the address bar in sync with the active screen. The first sync
  // replaces the history entry (so '/' doesn't linger); later ones push,
  // making the browser back/forward buttons work.
  const urlInitializedRef = useRef(false);
  useEffect(() => {
    const path = pathForScreen(screen, selectedId, {
      studyDeckId,
      editorCardId,
      editorPresetDeckId,
    });
    // Leave subpaths owned by the active screen alone (e.g. /revise/<id>,
    // which RevisionSession manages itself). The flashcards screens own no
    // subpaths — their URL is fully derived from state, so any mismatch there
    // is stale and must be rewritten rather than preserved.
    const here = window.location.pathname + window.location.search;
    const current = screenFromPath(window.location.pathname, window.location.search);
    const onSameScreen =
      current &&
      current.screen === screen &&
      (screen !== 'detail' || current.id === selectedId) &&
      !screen.startsWith('flashcards');
    if (!onSameScreen && here !== path) {
      if (urlInitializedRef.current) {
        window.history.pushState(null, '', path);
      } else {
        window.history.replaceState(null, '', path);
      }
    }
    urlInitializedRef.current = true;
  }, [screen, selectedId, studyDeckId, editorCardId, editorPresetDeckId]);

  // Browser back/forward → restore the screen for that history entry.
  useEffect(() => {
    const handlePopState = () => {
      const fromUrl = screenFromPath(window.location.pathname, window.location.search) || {
        screen: 'dashboard',
        id: null,
      };
      setScreen(fromUrl.screen);
      if (fromUrl.id) setSelectedId(fromUrl.id);
      if (fromUrl.screen === 'flashcards-study') setStudyDeckId(fromUrl.deckId ?? null);
      if (fromUrl.screen === 'flashcards-editor') {
        setEditorCardId(fromUrl.cardId ?? null);
        setEditorPresetDeckId(fromUrl.deckId ?? null);
      }
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
        setProblemsError(false);
      })
      .catch((err) => {
        console.warn('Could not load problems from backend:', err.message);
        setProblemsError(true);
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
  const [flashcardsDueCount, setFlashcardsDueCount] = useState(0);

  const loadFlashcardsDue = React.useCallback(() => {
    if (!user?.id || !FEATURES.flashcards) return;
    api.getFlashcardsDueCount()
      .then((data) => setFlashcardsDueCount(data?.count || 0))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    loadFlashcardsDue();
  }, [loadFlashcardsDue, screen]);

  // Navigation controller
  const handleNavigate = (targetScreen, params = {}) => {
    if (params.query !== undefined) {
      setInitialSearchQuery(params.query);
    } else {
      setInitialSearchQuery('');
    }
    if (params.deckId !== undefined) {
      setStudyDeckId(params.deckId);
    }
    if (params.cardId !== undefined) {
      setEditorCardId(params.cardId);
    } else {
      setEditorCardId(null);
    }
    if (params.presetDeckId !== undefined) {
      setEditorPresetDeckId(params.presetDeckId);
    } else {
      setEditorPresetDeckId(null);
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

  // Delete one or more problems. Partial failures are real: remove only the
  // rows the server confirmed and return the failed ids so the caller can
  // keep them selected and tell the user.
  const handleDeleteProblems = async (ids) => {
    const results = await Promise.allSettled(ids.map(id => api.deleteProblem(id)));
    const deletedIds = ids.filter((_, i) => results[i].status === 'fulfilled');
    const failedIds = ids.filter((_, i) => results[i].status === 'rejected');
    if (deletedIds.length) {
      setProblems(prevProblems => prevProblems.filter(p => !deletedIds.includes(p.id)));
      if (selectedId && deletedIds.includes(selectedId)) {
        setSelectedId(null);
        setScreen('problems');
      }
    }
    if (failedIds.length) {
      console.error(`Failed to delete ${failedIds.length} problem(s)`);
    }
    return failedIds;
  };

  // Add a problem imported from the LeetCode library (already created on the
  // backend) to local state.
  const handleSaveProblem = (newProblem) => {
    setProblems(prevProblems => [newProblem, ...prevProblems]);
  };

  // Dashboard/sidebar stats (streak, retention, weekly solves) — server-owned,
  // fetched here so the sidebar streak and the dashboard cards share one source
  // of truth. Refetched when the problem list changes so grading shows up.
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [statsRetryTick, setStatsRetryTick] = useState(0);

  // Clear on user change so a slow refetch never shows another user's stats.
  useEffect(() => {
    setStats(null);
    setStatsError(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    api.getStats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setStatsError(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Could not load stats:', err.message);
          setStatsError(true);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, problems, statsRetryTick]);

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
            problemsLoading={problemsLoading}
            problemsError={problemsError}
            onRetryProblems={loadProblems}
            topics={topics}
            userName={user?.name}
            dailyGoal={user?.dailyGoal ?? 10}
            stats={stats}
            statsError={statsError}
            onRetryStats={() => setStatsRetryTick((t) => t + 1)}
            onNavigate={handleNavigate}
            onOpenProblem={handleOpenProblem}
          />
        );
      case 'problems':
        return (
          <ProblemBank
            problems={problems}
            problemsLoading={problemsLoading}
            problemsError={problemsError}
            onRetryProblems={loadProblems}
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
        if (!FEATURES.flashcards) return null;
        return (
          <FlashcardDeckManager
            onNavigate={handleNavigate}
            onCardsChanged={loadFlashcardsDue}
            onStartStudy={({ deckId }) => {
              setStudyDeckId(deckId || null);
              handleNavigate('flashcards-study');
            }}
          />
        );
      case 'flashcards-study':
        if (!FEATURES.flashcards) return null;
        return (
          <FlashcardSession
            deckId={studyDeckId}
            onCardsChanged={loadFlashcardsDue}
            onNavigate={handleNavigate}
          />
        );
      case 'flashcards-editor':
        if (!FEATURES.flashcards) return null;
        return (
          <FlashcardCardEditor
            cardId={editorCardId}
            presetDeckId={editorPresetDeckId}
            onNavigate={handleNavigate}
            onSaveSuccess={() => handleNavigate('flashcards')}
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
        flashcardsCount={flashcardsDueCount}
        streakDays={stats ? stats.streakDays : null}
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
