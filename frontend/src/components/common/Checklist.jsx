import React from 'react';

export default function Checklist({ checklist, onToggleStep }) {
  return (
    <div className="flex flex-col gap-sp-2">
      {checklist.map((step, index) => {
        const isDone = step.done;
        
        return (
          <div
            key={index}
            onClick={() => onToggleStep && onToggleStep(index)}
            className={`flex items-center gap-sp-10 py-sp-6 select-none transition-colors duration-200 ${onToggleStep ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ color: step.color }}
          >
            {isDone ? (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" className="fill-accent" />
                <path
                  d="M6.4 10.2l2.3 2.3 4.8-4.9"
                  stroke="var(--color-text-dark-alt)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle
                  cx="10"
                  cy="10"
                  r="7.4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            )}
            <span
              className={`text-fs-13 ${step.strike ? 'line-through decoration-border-btn-hover' : ''} ${step.current ? 'font-semibold' : 'font-normal'}`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
