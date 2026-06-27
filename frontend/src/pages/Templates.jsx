import React, { useState, useMemo } from 'react';
import CodeBlock from '../components/common/CodeBlock';

export default function Templates({
  templates = []
}) {
  const [search, setSearch] = useState('');

  // Filter templates based on search query
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => 
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tag.toLowerCase().includes(search.toLowerCase()) ||
      t.concept.toLowerCase().includes(search.toLowerCase())
    );
  }, [templates, search]);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
      {/* Header & Search */}
      <div className="flex items-center justify-between">
        <div className="text-left">
          <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
            Templates &amp; patterns
          </div>
          <div className="font-mono text-fs-12 text-text-muted mt-1">
            {templates.length} patterns · the DSA Template PDF, made searchable
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-2 w-sp-230">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--color-border-accent)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="9" cy="9" r="6" />
            <line x1="13.5" y1="13.5" x2="17" y2="17" />
          </svg>
          <input
            type="text"
            placeholder="Search patterns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-text-main text-fs-13 w-full p-0"
          />
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-2 gap-4">
        {filteredTemplates.map((t, idx) => (
          <div 
            key={idx}
            className="bg-bg-card border border-border-card rounded-xl py-sp-18 px-sp-19 flex flex-col gap-3 text-left"
          >
            {/* Title & Tag */}
            <div className="flex items-center justify-between gap-2.5 self-stretch">
              <span className="text-fs-16 font-bold text-text-main tracking-[-0.01em]">
                {t.name}
              </span>
              <span className="font-mono text-fs-10-5 text-accent bg-accent/10 border border-accent/22 px-sp-9 py-sp-2 rounded-md whitespace-nowrap">
                {t.tag}
              </span>
            </div>

            {/* Concept */}
            <div className="text-fs-13 leading-[1.65] text-text-code">
              {t.concept}
            </div>

            {/* When to use */}
            <div>
              <div className="font-mono text-fs-10 text-text-muted tracking-[0.06em] mb-sp-5">
                WHEN TO USE
              </div>
              <div className="text-fs-12-5 leading-[1.55] text-text-mid">
                {t.whenToUse}
              </div>
            </div>

            {/* Template Code Block */}
            <CodeBlock 
              code={t.code} 
              title="TEMPLATE"
              className="mt-sp-2"
            />

          </div>
        ))}

        {filteredTemplates.length === 0 && (
          <div className="col-span-2 py-10 text-text-muted text-center">
            No patterns match your search query.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
