import React, { useState, useEffect } from 'react';
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
import NewProblemModal from './components/NewProblemModal';
import LeetCodeLibrary from './pages/LeetCodeLibrary';

import {
  INITIAL_PROBLEMS,
  INITIAL_CARDS,
  INITIAL_TOPICS
} from './data/initialData';

function App() {
  // Persistent client-side state
  const [screen, setScreen] = useLocalStorage('dsa_screen', 'dashboard');
  const [selectedId, setSelectedId] = useLocalStorage('dsa_selected_id', null);
  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [cards, setCards] = useLocalStorage('dsa_cards', INITIAL_CARDS);
  const [topics, setTopics] = useLocalStorage('dsa_topics', INITIAL_TOPICS);
  const [streakDays, setStreakDays] = useLocalStorage('dsa_streak', 0);
  const [theme, setTheme] = useLocalStorage('dsa_theme', 'blue'); // 'blue' or 'purple'
  const [user, setUser] = useLocalStorage('dsa_user', null);

  // Load problems from the backend database (user-scoped)
  useEffect(() => {
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


  // Template library: a two-level, user-editable set of patterns + code
  // variations, owned by the backend. Loaded per-user from the API; the server
  // seeds a starter library for new profiles (and lazily on first fetch).
  const [templatePatterns, setTemplatePatterns] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Temporary UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [initialSearchQuery, setInitialSearchQuery] = useState('');

  // Theme settings mapping
  const themeAccent = theme === 'blue' ? '#0070F3' : '#7928CA';
  const themeSecondary = theme === 'blue' ? '#0051CB' : '#4D1A80';

  // Navigation controller
  const handleNavigate = (targetScreen, params = {}) => {
    if (params.query !== undefined) {
      setInitialSearchQuery(params.query);
    } else {
      setInitialSearchQuery('');
    }
    setScreen(targetScreen);
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

  // Update a single problem in local state and database
  const handleUpdateProblem = async (updatedProblem) => {
    try {
      const res = await api.updateProblem(updatedProblem.id, updatedProblem);
      setProblems(prevProblems => {
        const nextProblems = prevProblems.map(p => 
          p.id === res.id ? res : p
        );
        recalculateTopicMastery(nextProblems);
        return nextProblems;
      });
    } catch (err) {
      console.error('Failed to update problem in database:', err.message);
    }
  };

  // Save new problem from modal
  const handleSaveProblem = async (newProblem) => {
    // If already created on backend (e.g. from LeetCode import)
    if (newProblem.id && !newProblem.id.startsWith('p_')) {
      setProblems(prevProblems => {
        const nextProblems = [newProblem, ...prevProblems];
        recalculateTopicMastery(nextProblems);
        return nextProblems;
      });
      return;
    }

    // Manual creation via modal
    try {
      const created = await api.createProblem(newProblem);
      setProblems(prevProblems => {
        const nextProblems = [created, ...prevProblems];
        recalculateTopicMastery(nextProblems);
        return nextProblems;
      });
    } catch (err) {
      console.error('Failed to create manual problem in DB:', err.message);
    }
  };


  // Recalculates the topic mastery completion percentage automatically
  const recalculateTopicMastery = (currentProblems) => {
    setTopics(prevTopics => {
      return prevTopics.map(topic => {
        const topicProblems = currentProblems.filter(p => p.topic.toLowerCase() === topic.name.toLowerCase());
        if (topicProblems.length === 0) return topic;

        const solved = topicProblems.filter(p => p.status === 'Done').length;
        const total = topicProblems.length;
        
        // Simulating the pdf fraction standard (e.g. solved/total fraction)
        // We preserve the denominator base for visual consistency but update numerator
        const parts = topic.frac.split('/');
        const originalTotal = parseInt(parts[1], 10) || total;
        
        // Scale numerator proportionally
        const ratio = solved / total;
        const scaledSolved = Math.round(ratio * originalTotal);

        return {
          ...topic,
          pct: Math.round(ratio * 100),
          frac: `${scaledSolved}/${originalTotal}`
        };
      });
    });
  };

  // Helper to fetch current selected problem
  const currentProblem = problems.find(p => p.id === selectedId) || problems[0];

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
            onOpenNewProblemModal={() => setIsModalOpen(true)}
            themeColor={themeAccent}
          />
        );
      case 'problems':
        return (
          <ProblemBank
            problems={problems}
            onOpenProblem={handleOpenProblem}
            onOpenNewProblemModal={() => setIsModalOpen(true)}
            initialSearchQuery={initialSearchQuery}
            themeColor={themeAccent}
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
            themeColor={themeAccent}
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
        return (
          <ProblemDetail
            problem={currentProblem}
            onBack={() => setScreen('problems')}
            onUpdateProblem={handleUpdateProblem}
            templatePatterns={templatePatterns}
            themeColor={themeAccent}
          />
        );
      case 'revise':
        return (
          <RevisionSession
            problems={problems}
            onUpdateProblem={handleUpdateProblem}
            onNavigate={handleNavigate}
            themeColor={themeAccent}
          />
        );
      case 'flashcards':
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
      </div>      {/* Add New Problem Form Overlay */}
      <NewProblemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProblem}
        themeColor={themeAccent}
      />
    </div>
  );
}

export default App;
