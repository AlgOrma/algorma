import React, { useState } from 'react';
import SyntaxHighlighter from './SyntaxHighlighter';

export default function CodeBlock({ 
  code, 
  isSpoiler = false, 
  revealed = false, 
  onToggleReveal, 
  title = 'SOLUTION',
  className = '',
  style = {}
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const blurStyle = isSpoiler && !revealed ? 'blur(7px)' : 'none';

  return (
    <div
      className={`bg-bg-code border border-border-main rounded-xl overflow-hidden relative ${className}`}
      style={style}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-sp-11 border-b border-border-muted">
        <div className="flex items-center gap-sp-9">
          <span className="font-mono text-fs-11 text-text-muted tracking-[0.05em]">
            {title}
          </span>
          {isSpoiler && (
            <span className="font-mono text-fs-10-5 text-accent bg-accent/10 px-sp-7 py-sp-1 rounded-card-xxs">
              spoiler-free
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="bg-transparent border-none cursor-pointer font-mono text-fs-10 text-text-muted hover:text-text-main transition-colors duration-200 px-sp-6 py-sp-2"
          >
            {copied ? 'copied!' : 'copy'}
          </button>

          {isSpoiler && revealed && (
            <button
              onClick={onToggleReveal}
              className="bg-transparent border-none cursor-pointer font-mono text-fs-11-5 text-text-muted hover:text-text-hover p-0"
            >
              Hide ▲
            </button>
          )}
        </div>
      </div>

      {/* Code contents area */}
      <div className="relative">
        <pre
          className="m-0 px-4 py-sp-15 font-mono text-fs-12-5 leading-[1.65] text-text-code transition-[filter] duration-300 overflow-x-auto text-left"
          style={{
            filter: blurStyle,
            userSelect: isSpoiler && !revealed ? 'none' : 'text'
          }}
        >
          <SyntaxHighlighter code={code} />
        </pre>

        {/* Spoiler overlay */}
        {isSpoiler && !revealed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-sp-13 bg-bg-code/55">
            <div className="flex items-center gap-2 text-text-muted text-fs-12-5">
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4.5" y="9" width="11" height="8" rx="1.6" />
                <path d="M7 9V6.8a3 3 0 0 1 6 0V9" />
              </svg>
              Hidden so this page doubles as revision later
            </div>
            <button
              onClick={onToggleReveal}
              className="font-sans text-fs-13 font-semibold text-text-dark-alt bg-accent border-none px-sp-17 py-sp-9 rounded-card-btn cursor-pointer flex items-center gap-2 hover:brightness-110 transition-all duration-200"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="none"
                stroke="var(--color-text-dark-alt)"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
                <circle cx="10" cy="10" r="2.4" />
              </svg>
              Reveal solution
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
