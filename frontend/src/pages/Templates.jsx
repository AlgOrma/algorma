import React, { useState, useMemo } from 'react';
import SyntaxHighlighter from '../components/common/SyntaxHighlighter';

// A two-level, editable template library (mirrors the claude.ai/design screen).
// A parent "pattern" holds shared guidance (description) plus named code
// "variations". Patterns come from the backend; create/update/delete are passed
// in from App as async handlers that call the API.

// Universal delete icon (Feather "trash-2"); inherits color via currentColor.
const TrashIcon = ({ size = 14, className = '' }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const genId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const blankVariation = () => ({
  id: genId('v'),
  name: 'New variation',
  desc: '',
  lang: 'Python',
  code: '',
});

export default function Templates({
  patterns = [],
  loading = false,
  onCreatePattern,
  onUpdatePattern,
  onDeletePattern,
}) {
  const [search, setSearch] = useState('');
  // Land fully collapsed: no pattern auto-expands, and variations stay collapsed
  // until opened. `expanded` / `varExpanded` hold the ids the user has opened.
  const [expanded, setExpanded] = useState({});
  const [varExpanded, setVarExpanded] = useState({});
  const [menuId, setMenuId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editScope, setEditScope] = useState(null); // 'full' | 'vars'
  const [draft, setDraft] = useState(null);

  const query = search.trim().toLowerCase();

  // --- pattern-list mutations (persisted through the API via App) ---
  const toggle = (id) =>
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  const toggleVar = (id) =>
    setVarExpanded((s) => ({ ...s, [id]: !s[id] }));

  const startEdit = (id) => {
    const p = patterns.find((x) => x.id === id);
    if (!p) return;
    setDraft(JSON.parse(JSON.stringify(p)));
    setEditId(id);
    setEditScope('full');
    setMenuId(null);
    setExpanded((s) => ({ ...s, [id]: true }));
  };

  const cancelEdit = () => {
    setEditId(null);
    setDraft(null);
    setEditScope(null);
  };

  const saveEdit = async () => {
    if (!draft) return;
    try {
      await onUpdatePattern(draft.id, draft);
      cancelEdit();
    } catch (err) {
      // Keep the editor open so the user's work isn't lost on a failed save.
      console.warn('Could not save pattern:', err.message);
    }
  };

  const addPattern = async () => {
    const blank = {
      name: 'New pattern',
      topic: 'Topic',
      description: '',
      variations: [{ name: 'Variation 1', desc: '', lang: 'Python', code: '' }],
    };
    try {
      const created = await onCreatePattern(blank); // server assigns ids
      setDraft(JSON.parse(JSON.stringify(created)));
      setEditId(created.id);
      setEditScope('full');
      setMenuId(null);
      setExpanded((s) => ({ ...s, [created.id]: true }));
    } catch (err) {
      console.warn('Could not create pattern:', err.message);
    }
  };

  const deletePattern = async (id) => {
    setMenuId(null);
    try {
      await onDeletePattern(id);
      if (editId === id) cancelEdit();
    } catch (err) {
      console.warn('Could not delete pattern:', err.message);
    }
  };

  // Delete a single variation straight from view mode: persist the pattern with
  // that variation removed (the API replaces the whole variation set on save).
  const deleteVariation = async (patternId, variationId) => {
    const pattern = patterns.find((p) => p.id === patternId);
    if (!pattern) return;
    const updated = {
      ...pattern,
      variations: pattern.variations.filter((v) => v.id !== variationId),
    };
    try {
      await onUpdatePattern(patternId, updated);
    } catch (err) {
      console.warn('Could not delete variation:', err.message);
    }
  };

  // Header "+ Variation": jump straight into edit mode with a new variation.
  const addVariation = (id) => {
    if (editId === id) {
      draftAddVar();
      return;
    }
    const p = patterns.find((x) => x.id === id);
    if (!p) return;
    const next = JSON.parse(JSON.stringify(p));
    next.variations.push(blankVariation());
    setDraft(next);
    setEditId(id);
    setEditScope('vars');
    setMenuId(null);
    setExpanded((s) => ({ ...s, [id]: true }));
  };

  // --- draft (in-edit) mutations ---
  const draftSet = (field, value) =>
    setDraft((d) => ({ ...d, [field]: value }));
  const draftVarSet = (i, field, value) =>
    setDraft((d) => ({
      ...d,
      variations: d.variations.map((v, idx) =>
        idx === i ? { ...v, [field]: value } : v
      ),
    }));
  const draftAddVar = () =>
    setDraft((d) => ({ ...d, variations: [...d.variations, blankVariation()] }));
  const draftRemoveVar = (i) =>
    setDraft((d) => ({
      ...d,
      variations: d.variations.filter((_, idx) => idx !== i),
    }));

  // --- derived view ---
  const filtered = useMemo(() => {
    if (!query) return patterns;
    return patterns.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.topic.toLowerCase().includes(query) ||
        (p.description || '').toLowerCase().includes(query) ||
        p.variations.some((v) => v.name.toLowerCase().includes(query))
    );
  }, [patterns, query]);

  const totalVariations = patterns.reduce((a, p) => a + p.variations.length, 0);
  const subtitle = `${patterns.length} ${
    patterns.length === 1 ? 'pattern' : 'patterns'
  } · ${totalVariations} ${totalVariations === 1 ? 'variation' : 'variations'}`;

  const isEmpty = !loading && patterns.length === 0;
  const noMatches = patterns.length > 0 && filtered.length === 0;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[920px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
        {/* Header & search */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-left">
            <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
              Templates &amp; patterns
            </div>
            <div className="font-mono text-fs-12 text-text-muted mt-1">
              {subtitle}
            </div>
          </div>

          <div className="flex items-center gap-sp-9 flex-none">
            <div className="flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-2 w-sp-210">
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
            <button
              onClick={addPattern}
              className="flex items-center gap-1.5 text-fs-13 font-semibold text-text-dark-alt bg-accent border-none px-3.5 py-sp-9 rounded-card-btn cursor-pointer whitespace-nowrap hover:bg-accent-secondary transition-colors duration-200"
            >
              <span className="text-fs-15 leading-[0] mt-[-1px]">+</span> New pattern
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && patterns.length === 0 && (
          <div className="bg-bg-card border border-border-card rounded-card-md py-sp-30 px-sp-18 text-center text-fs-13 text-text-muted">
            Loading templates…
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="bg-bg-card border border-dashed border-border-btn rounded-[14px] py-12 px-6 flex flex-col items-center text-center gap-1.5">
            <div className="w-[46px] h-[46px] rounded-card-md bg-accent/10 border border-accent/22 flex items-center justify-center mb-1.5">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent-blue)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
                <line x1="10" y1="7" x2="10" y2="13" />
                <line x1="7" y1="10" x2="13" y2="10" />
              </svg>
            </div>
            <div className="text-fs-16 font-bold text-text-main">No patterns yet</div>
            <div className="text-fs-13 text-text-mid max-w-[340px] leading-[1.6]">
              Capture a reusable approach once — its guidance and code variations —
              and reach for it the moment a problem smells familiar.
            </div>
            <button
              onClick={addPattern}
              className="mt-3 text-fs-13 font-semibold text-text-dark-alt bg-accent border-none px-4 py-sp-9 rounded-card-btn cursor-pointer hover:bg-accent-secondary transition-colors duration-200"
            >
              + New pattern
            </button>
          </div>
        )}

        {/* No matches */}
        {noMatches && (
          <div className="bg-bg-card border border-border-card rounded-card-md py-sp-30 px-sp-18 text-center text-fs-13 text-text-muted">
            No patterns match “{search}”.
          </div>
        )}

        {/* Pattern list */}
        <div className="flex flex-col gap-sp-14">
          {filtered.map((p) => {
            const editing = editId === p.id;
            const src = editing ? draft : p;
            const open = editing || !!query || !!expanded[p.id];
            const metaEdit = editing && editScope === 'full';
            const descriptionText = src.description || '';
            const hasDescription = !!descriptionText.trim();

            return (
              <div
                key={p.id}
                className="bg-bg-card border border-border-card rounded-[14px] text-left"
              >
                {/* Card header */}
                <div className="flex items-center gap-2.5 px-4 py-sp-15">
                  <span
                    title="Drag to reorder"
                    className="font-mono text-fs-15 text-border-btn-hover/60 cursor-grab leading-none select-none"
                  >
                    ⠿
                  </span>
                  <div
                    onClick={() => toggle(p.id)}
                    className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                  >
                    <span className="text-fs-12 text-text-muted w-3 flex-none">
                      {open ? '▾' : '▸'}
                    </span>
                    <span className="text-fs-16 font-bold text-text-main tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis">
                      {src.name}
                    </span>
                    <span className="font-mono text-fs-10-5 text-accent-blue bg-accent/10 border border-accent/22 px-sp-9 py-sp-2 rounded-md whitespace-nowrap flex-none">
                      {src.topic}
                    </span>
                    <span className="font-mono text-fs-10-5 text-border-accent flex-none">
                      {src.variations.length} var
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-none">
                    <button
                      onClick={() => addVariation(p.id)}
                      className="font-mono text-fs-11-5 font-medium text-text-hover bg-bg-btn-sec border border-border-btn px-2.5 py-1.5 rounded-card-xs cursor-pointer hover:border-border-btn-hover transition-colors duration-200"
                    >
                      + Variation
                    </button>
                    <div className="relative">
                      <button
                        onClick={() =>
                          setMenuId((m) => (m === p.id ? null : p.id))
                        }
                        className="w-[30px] h-[30px] flex items-center justify-center text-text-muted bg-transparent border border-transparent rounded-card-xs cursor-pointer text-fs-16 hover:bg-bg-btn-sec transition-colors duration-200"
                      >
                        ⋯
                      </button>
                      {menuId === p.id && (
                        <div className="absolute right-0 top-[34px] z-[5] bg-bg-element-hover border border-border-btn rounded-card-md p-1.5 w-[152px] shadow-[0_14px_34px_-12px_rgba(0,0,0,0.7)]">
                          <div
                            onClick={() => startEdit(p.id)}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-card-xs text-fs-13 text-text-main cursor-pointer hover:bg-bg-btn-sec-hover transition-colors duration-150"
                          >
                            ✎ Edit
                          </div>
                          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-card-xs text-fs-13 text-text-hover cursor-grab hover:bg-bg-btn-sec-hover transition-colors duration-150">
                            ⠿ Reorder
                          </div>
                          <div
                            onClick={() => deletePattern(p.id)}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-card-xs text-fs-13 text-accent-red-hover cursor-pointer hover:bg-accent-red-hover/[0.12] transition-colors duration-150"
                          >
                            <TrashIcon className="flex-none" /> Delete
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card body */}
                {open && (
                  <div className="px-4 pb-4 flex flex-col gap-sp-14">
                    {/* View mode */}
                    {!editing && (
                      <>
                        {hasDescription && (
                          <div className="bg-bg-main border border-border-muted rounded-card-sm py-sp-14 px-sp-15">
                            <div className="font-mono text-fs-10 text-text-muted tracking-[0.06em] mb-2.5">
                              WHEN TO USE
                            </div>
                            <div className="text-fs-13 leading-[1.7] text-text-code whitespace-pre-wrap">
                              {descriptionText}
                            </div>
                          </div>
                        )}

                        {src.variations.map((v) => {
                          const vOpen = !!query || !!varExpanded[v.id];
                          return (
                            <div
                              key={v.id}
                              className="border border-border-muted border-l-2 border-l-accent/40 rounded-card-md bg-[#1f1c19] py-sp-13 px-sp-14"
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  onClick={() => toggleVar(v.id)}
                                  className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                                >
                                  <span
                                    title="Drag to reorder"
                                    className="font-mono text-fs-13 text-border-btn-hover/60 cursor-grab leading-none flex-none select-none"
                                  >
                                    ⠿
                                  </span>
                                  <span className="text-fs-11 text-text-muted w-2.5 flex-none">
                                    {vOpen ? '▾' : '▸'}
                                  </span>
                                  <span className="text-fs-14 font-semibold text-text-main flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                                    {v.name}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteVariation(p.id, v.id);
                                  }}
                                  title="Delete variation"
                                  className="w-[26px] h-[26px] flex-none flex items-center justify-center text-accent-red-hover bg-transparent border border-transparent rounded-card-xs cursor-pointer hover:bg-accent-red-hover/[0.14] transition-colors duration-150"
                                >
                                  <TrashIcon />
                                </button>
                              </div>

                              {vOpen && (
                                <>
                                  {v.desc && (
                                    <div className="text-fs-12-5 text-text-mid leading-[1.55] mt-1.5 ml-[31px]">
                                      {v.desc}
                                    </div>
                                  )}
                                  <div className="mt-2.5 ml-[31px] bg-bg-panel-dark border border-border-muted rounded-card-btn overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-[7px] border-b border-border-subtle">
                                      <span className="font-mono text-fs-9-5 text-border-accent tracking-[0.05em]">
                                        TEMPLATE · {v.lang}
                                      </span>
                                      <span
                                        onClick={() =>
                                          navigator.clipboard?.writeText(v.code)
                                        }
                                        className="font-mono text-fs-10 text-text-muted cursor-pointer hover:text-text-hover transition-colors duration-150"
                                      >
                                        copy
                                      </span>
                                    </div>
                                    <pre className="m-0 py-3 px-3.5 font-mono text-fs-11-5 leading-[1.6] text-text-code whitespace-pre overflow-x-auto custom-scrollbar">
                                      <SyntaxHighlighter code={v.code} />
                                    </pre>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Edit mode */}
                    {editing && (
                      <>
                        {metaEdit && (
                          <div className="bg-bg-main border border-accent/30 rounded-card-sm py-sp-14 px-sp-15 flex flex-col gap-sp-13">
                            <div className="flex gap-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-fs-9-5 text-text-muted tracking-[0.06em] mb-sp-5">
                                  PATTERN NAME
                                </div>
                                <input
                                  value={draft.name}
                                  onChange={(e) => draftSet('name', e.target.value)}
                                  className="w-full box-border bg-bg-panel-dark border border-border-main rounded-card-btn px-2.5 py-2 text-text-main text-fs-14 font-semibold outline-none focus:border-accent"
                                />
                              </div>
                              <div className="w-[150px] flex-none">
                                <div className="font-mono text-fs-9-5 text-text-muted tracking-[0.06em] mb-sp-5">
                                  TOPIC
                                </div>
                                <input
                                  value={draft.topic}
                                  onChange={(e) => draftSet('topic', e.target.value)}
                                  className="w-full box-border bg-bg-panel-dark border border-border-main rounded-card-btn px-2.5 py-2 text-accent-blue font-mono text-fs-12 outline-none focus:border-accent"
                                />
                              </div>
                            </div>
                            <div>
                              <div className="font-mono text-fs-9-5 text-text-muted tracking-[0.06em] mb-2">
                                DESCRIPTION
                              </div>
                              <textarea
                                value={draft.description}
                                onChange={(e) => draftSet('description', e.target.value)}
                                rows={6}
                                placeholder="Describe this pattern…"
                                className="w-full box-border bg-bg-panel-dark border border-border-main rounded-card-btn px-3 py-2.5 text-text-code text-fs-13 leading-[1.65] outline-none resize-y focus:border-accent"
                              />
                            </div>
                          </div>
                        )}

                        {draft.variations.map((v, i) => (
                          <div
                            key={v.id}
                            className="border border-border-muted border-l-2 border-l-accent/40 rounded-card-md bg-[#1f1c19] py-sp-13 px-sp-14 flex flex-col gap-2.5"
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                value={v.name}
                                onChange={(e) => draftVarSet(i, 'name', e.target.value)}
                                placeholder="Variation heading"
                                className="flex-1 min-w-0 bg-bg-panel-dark border border-border-main rounded-card-btn px-2.5 py-2 text-text-main text-fs-13-5 font-semibold outline-none focus:border-accent"
                              />
                              <select
                                value={v.lang}
                                onChange={(e) => draftVarSet(i, 'lang', e.target.value)}
                                className="w-[105px] flex-none bg-bg-panel-dark border border-border-main rounded-card-btn px-2.5 py-2 text-accent-blue font-mono text-fs-11-5 outline-none focus:border-accent cursor-pointer appearance-none"
                                style={{
                                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238CABF4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'right 8px center',
                                  backgroundSize: '12px',
                                  paddingRight: '22px'
                                }}
                              >
                                {["Python", "C++", "C", "Java", "Go", "Rust"].map(lang => (
                                  <option key={lang} value={lang}>{lang}</option>
                                ))}
                                {v.lang && !["Python", "C++", "C", "Java", "Go", "Rust"].includes(v.lang) && (
                                  <option value={v.lang}>{v.lang}</option>
                                )}
                              </select>
                              <button
                                onClick={() => draftRemoveVar(i)}
                                title="Remove variation"
                                className="w-[30px] h-[30px] flex-none flex items-center justify-center text-accent-red-hover bg-accent-red-hover/10 border border-accent-red-hover/20 rounded-card-btn cursor-pointer hover:bg-accent-red-hover/[0.18] transition-colors duration-150"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                            <input
                              value={v.desc}
                              onChange={(e) => draftVarSet(i, 'desc', e.target.value)}
                              placeholder="One-line description (optional)"
                              className="bg-bg-panel-dark border border-border-main rounded-card-btn px-2.5 py-2 text-text-mid text-fs-12-5 outline-none focus:border-accent"
                            />
                            <div className="bg-bg-panel-dark border border-border-muted rounded-card-btn overflow-hidden">
                              <div className="flex items-center px-3 py-[7px] border-b border-border-subtle font-mono text-fs-9-5 text-border-accent tracking-[0.05em]">
                                TEMPLATE
                              </div>
                              <textarea
                                value={v.code}
                                onChange={(e) => draftVarSet(i, 'code', e.target.value)}
                                rows={7}
                                spellCheck={false}
                                placeholder="Paste your code template…"
                                className="block w-full box-border m-0 py-3 px-3.5 bg-transparent border-none font-mono text-fs-11-5 leading-[1.6] text-text-code outline-none resize-y"
                              />
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={draftAddVar}
                            className="font-mono text-fs-12 font-medium text-text-hover bg-bg-btn-sec border border-border-btn px-3 py-2 rounded-card-btn cursor-pointer hover:border-border-btn-hover transition-colors duration-200"
                          >
                            + Add variation
                          </button>
                          <div className="ml-auto flex gap-2">
                            <button
                              onClick={cancelEdit}
                              className="text-fs-13 font-semibold text-text-hover bg-transparent border border-border-btn px-4 py-2 rounded-card-btn cursor-pointer hover:border-border-btn-hover transition-colors duration-200"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              className="text-fs-13 font-semibold text-text-dark-alt bg-accent border-none px-[18px] py-2 rounded-card-btn cursor-pointer hover:bg-accent-secondary transition-colors duration-200"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
