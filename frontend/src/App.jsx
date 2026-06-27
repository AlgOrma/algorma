import React, { useState } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ProblemBank from './pages/ProblemBank';
import Templates from './pages/Templates';
import ProblemDetail from './pages/ProblemDetail';
import RevisionSession from './pages/RevisionSession';
import FlashcardSession from './pages/FlashcardSession';
import ProfileSetup from './pages/ProfileSetup';
import NewProblemModal from './components/NewProblemModal';

import {
  INITIAL_PROBLEMS,
  INITIAL_TEMPLATES,
  INITIAL_CARDS,
  INITIAL_TOPICS
} from './data/initialData';

function App() {
  // Persistent client-side state
  const [screen, setScreen] = useLocalStorage('dsa_screen', 'dashboard');
  const [selectedId, setSelectedId] = useLocalStorage('dsa_selected_id', 'p2');
  const [problems, setProblems] = useLocalStorage('dsa_problems', INITIAL_PROBLEMS);
  const [cards, setCards] = useLocalStorage('dsa_cards', INITIAL_CARDS);
  const [topics, setTopics] = useLocalStorage('dsa_topics', INITIAL_TOPICS);
  const [streakDays, setStreakDays] = useLocalStorage('dsa_streak', 12);
  const [theme, setTheme] = useLocalStorage('dsa_theme', 'blue'); // 'blue' or 'purple'
  const [user, setUser] = useLocalStorage('dsa_user', null);

  // Temporary UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [initialSearchQuery, setInitialSearchQuery] = useState('');

  // Theme settings mapping
  const themeAccent = theme === 'blue' ? '#3E72D9' : '#9B86F5';
  const themeSecondary = theme === 'blue' ? '#2B52AE' : '#7660d8';

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

  // Save profile from first-run setup or the edit-profile screen
  const handleSaveProfile = (nextUser) => {
    setUser(nextUser);
    setIsEditingProfile(false);
  };

  // Update a single problem in local state
  const handleUpdateProblem = (updatedProblem) => {
    setProblems(prevProblems => {
      const nextProblems = prevProblems.map(p => 
        p.id === updatedProblem.id ? updatedProblem : p
      );
      
      // Dynamic topic mastery recalculation
      recalculateTopicMastery(nextProblems);
      return nextProblems;
    });
  };

  // Save new problem from modal
  const handleSaveProblem = (newProblem) => {
    setProblems(prevProblems => {
      const nextProblems = [newProblem, ...prevProblems];
      recalculateTopicMastery(nextProblems);
      return nextProblems;
    });
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
      case 'templates':
        return (
          <Templates
            templates={INITIAL_TEMPLATES}
            themeColor={themeAccent}
          />
        );
      case 'detail':
        return (
          <ProblemDetail
            problem={currentProblem}
            onBack={() => setScreen('problems')}
            onUpdateProblem={handleUpdateProblem}
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
        templatesCount={INITIAL_TEMPLATES.length}
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
