import React from 'react';
import { FEATURES } from '../features';

export default function Sidebar({
  activeScreen,
  onNavigate,
  problemsCount = 142,
  customListsCount = 0,
  templatesCount = 24,
  reviseCount = 5,
  flashcardsCount = 6,
  streakDays = 12,
  user = null,
  onEditProfile
}) {

  const userInitial = (user?.name || '?').trim().charAt(0).toUpperCase() || '?';
  
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="6" height="6" rx="1.3"/>
          <rect x="11" y="3" width="6" height="6" rx="1.3"/>
          <rect x="3" y="11" width="6" height="6" rx="1.3"/>
          <rect x="11" y="11" width="6" height="6" rx="1.3"/>
        </svg>
      )
    },
    {
      id: 'leetcode',
      label: 'LeetCode',
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill={color}>
          <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
        </svg>
      )
    },
    {
      id: 'problems',
      label: 'Problems',
      badge: problemsCount,
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="5.5" x2="17" y2="5.5"/>
          <line x1="7" y1="10" x2="17" y2="10"/>
          <line x1="7" y1="14.5" x2="17" y2="14.5"/>
          <circle cx="3.6" cy="10" r="1.1"/>
          <circle cx="3.6" cy="5.5" r="1.1"/>
          <circle cx="3.6" cy="14.5" r="1.1"/>
        </svg>
      )
    },
    {
      id: 'custom-lists',
      label: 'Custom Lists',
      badge: customListsCount,
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 13.5V4a1.5 1.5 0 0 1 1.5-1.5h4.5a1.5 1.5 0 0 1 1.25.75L10.5 5h6A1.5 1.5 0 0 1 18 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 13.5z"/>
          <line x1="8" y1="10" x2="12" y2="10"/>
          <line x1="10" y1="8" x2="10" y2="12"/>
        </svg>
      )
    },
    {
      id: 'templates',
      label: 'Templates',
      badge: templatesCount,
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="7.5 6.5 4 10 7.5 13.5"/>
          <polyline points="12.5 6.5 16 10 12.5 13.5"/>
        </svg>
      )
    },
    {
      id: 'revise',
      label: 'Revise',
      badge: reviseCount,
      badgeColor: 'text-accent',
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 7.5a6 6 0 1 0 1 5"/>
          <polyline points="16.5 3.5 16.5 7.5 12.5 7.5"/>
        </svg>
      )
    },
    {
      id: 'flashcards',
      hidden: !FEATURES.flashcards,
      label: 'Flashcards',
      badge: flashcardsCount,
      badgeColor: 'text-accent',
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5.5" width="11" height="9" rx="1.6"/>
          <path d="M6 5.5V4.2A1.2 1.2 0 0 1 7.2 3H17v8.5"/>
        </svg>
      )
    }
  ];

  return (
    <div className="w-sidebar-w flex-none bg-bg-sidebar border-r border-border-main px-3.5 py-5 flex flex-col gap-1.25 h-full">
      {/* Header / Logo */}
      <div className="flex items-center gap-sp-10 px-2 pt-sp-2 pb-sp-18">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center font-mono text-fs-13 font-semibold text-text-dark">
          ›_
        </div>
        <span className="font-bold text-fs-15 tracking-[-0.015em] bg-gradient-to-r from-accent to-accent-secondary bg-clip-text text-transparent">
          AlgOrma
        </span>
      </div>

      {/* Nav List */}
      {navItems.filter((item) => !item.hidden).map((item) => {
        const isActive = activeScreen === item.id || (item.id === 'problems' && activeScreen === 'detail');
        const color = isActive ? 'var(--color-text-main)' : 'var(--color-text-muted)';

        return (
          <div
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-sp-11 px-sp-11 py-2.5 rounded-card-btn text-fs-14 font-medium cursor-pointer transition-all duration-150 border ${
              isActive 
                ? 'bg-white/10 border-white/5 text-white' 
                : 'bg-transparent border-transparent text-text-muted hover:text-white hover:bg-white/5'
            }`}
          >
            {item.icon(color)}
            {item.label}
            {item.badge !== undefined && (
              <span className={`ml-auto font-mono text-fs-11 ${item.badgeColor || 'text-text-muted opacity-70'}`}>
                {item.badge}
              </span>
            )}
          </div>
        );
      })}

      {/* Bottom group: profile card + streak widget */}
      <div className="mt-auto flex flex-col gap-sp-10">

      {/* Profile card — opens the edit-profile screen */}
      <div
        onClick={onEditProfile}
        title="Edit profile"
        className="flex items-center gap-sp-10 px-2.5 py-sp-9 rounded-card-sm bg-bg-card border border-border-card cursor-pointer transition-colors hover:border-border-btn-hover"
      >
        <div className="w-[30px] h-[30px] flex-none rounded-md bg-accent flex items-center justify-center font-bold text-fs-13 text-white">
          {userInitial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-fs-13 font-semibold text-text-main whitespace-nowrap overflow-hidden text-ellipsis">
            {user?.name || 'Your profile'}
          </div>
          <div className="font-mono text-fs-10 text-text-muted mt-sp-1">
            goal · {user?.dailyGoal ?? 10}/day
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--color-border-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.5 4.5l3 3" />
          <path d="M4 16.5l-.7.2.2-.7L13 6.5l.5-.5 3 3-.5.5-8.5 8.5z" />
        </svg>
      </div>

      {/* Current Streak Widget */}
      <div className="p-3.5 rounded-card-sm bg-bg-card border border-border-card">
        <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
          CURRENT STREAK
        </div>
        <div className="flex items-baseline gap-1.5 mt-sp-5">
          <span className="font-mono text-fs-23 font-semibold text-text-main">
            {streakDays}
          </span>
          <span className="text-fs-12 text-text-muted">days</span>
        </div>
        <div className="flex gap-sp-4 mt-2.5 items-center">
          {/* Mock active streak visualizer */}
          <div className="w-sp-7 h-sp-14 rounded-sm bg-bg-dot-empty" />
          <div className="w-sp-7 h-sp-14 rounded-sm bg-bg-dot-fill" />
          <div className="w-sp-7 h-sp-14 rounded-sm bg-accent-secondary/30" />
          <div className="w-sp-7 h-sp-14 rounded-sm bg-accent/60" />
          <div className="w-sp-7 h-sp-14 rounded-sm bg-accent" />
          <div className="w-sp-7 h-sp-14 rounded-sm bg-accent" />
          <div className="w-sp-7 h-sp-14 rounded-sm bg-accent" />
        </div>
      </div>

      </div>
    </div>
  );
}
