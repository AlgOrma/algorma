import React from 'react';

export default function Sidebar({
  activeScreen,
  onNavigate,
  problemsCount = 142,
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
      id: 'leetcode',
      label: 'LeetCode',
      icon: (color) => (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="14" height="14" rx="2" strokeWidth="1.6"/>
          <line x1="7" y1="7" x2="13" y2="7"/>
          <line x1="7" y1="10" x2="13" y2="10"/>
          <line x1="7" y1="13" x2="11" y2="13"/>
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
        <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center font-mono text-fs-13 font-semibold text-black">
          ›_
        </div>
        <span className="font-bold text-fs-15 text-text-main tracking-[-0.015em]">
          AlgOrma
        </span>
      </div>

      {/* Nav List */}
      {navItems.map((item) => {
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
