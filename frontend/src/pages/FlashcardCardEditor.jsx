import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../components/common/Button';
import FormattedText from '../components/common/FormattedText';
import * as api from '../api';

export default function FlashcardCardEditor({ cardId = null, presetDeckId = null, onNavigate, onSaveSuccess }) {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    front: '',
    back: '',
    deckId: presetDeckId || '',
    tag: 'General',
    type: 'concept',
  });

  const [activeField, setActiveField] = useState('front'); // 'front' | 'back'
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'edit' | 'preview'

  const frontRef = useRef(null);
  const backRef = useRef(null);

  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedDecks = await api.getDecks();
        setDecks(fetchedDecks || []);

        if (cardId) {
          const card = await api.getFlashcard(cardId);
          if (card) {
            setForm({
              front: card.front || '',
              back: card.back || '',
              deckId: card.deckId || '',
              tag: card.tag || 'General',
              type: card.type || 'concept',
            });
          }
        } else if (presetDeckId !== null && presetDeckId !== undefined) {
          // An explicit preset wins — including '' for "(General / Unassigned)".
          setForm((prev) => ({ ...prev, deckId: presetDeckId }));
        } else if (fetchedDecks && fetchedDecks.length > 0) {
          setForm((prev) => ({ ...prev, deckId: fetchedDecks[0].id }));
        }
      } catch (err) {
        console.error('Failed to load card editor data:', err);
        setError('Could not load card details or decks.');
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [cardId, presetDeckId]);

  // Insert markdown formatting into active field
  const applyFormat = (prefix, suffix = '') => {
    const targetRef = activeField === 'front' ? frontRef.current : backRef.current;
    if (!targetRef) return;

    const start = targetRef.selectionStart;
    const end = targetRef.selectionEnd;
    const text = form[activeField];
    const selection = text.substring(start, end);

    let defaultPlaceholder = 'text';
    if (prefix.includes('```')) {
      defaultPlaceholder = 'def solution():\n    return 42';
    } else if (prefix === '`') {
      defaultPlaceholder = 'code';
    } else if (prefix === '$') {
      defaultPlaceholder = 'E=mc^2';
    }

    const contentToWrap = selection || defaultPlaceholder;
    const replacement = `${prefix}${contentToWrap}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);

    setForm({ ...form, [activeField]: newText });

    setTimeout(() => {
      targetRef.focus();
      targetRef.setSelectionRange(start + prefix.length, start + prefix.length + contentToWrap.length);
    }, 50);
  };

  const handleSave = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!form.front.trim() || !form.back.trim()) {
      setError('Both Front (Prompt) and Back (Answer) sides are required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      if (cardId) {
        await api.updateFlashcard(cardId, form);
      } else {
        await api.createFlashcard(form);
      }
      if (onSaveSuccess) onSaveSuccess();
      else onNavigate('flashcards');
    } catch (err) {
      console.error('Failed to save card:', err);
      setError(err.message || 'Failed to save flashcard.');
      setSaving(false);
    }
  }, [cardId, form, onNavigate, onSaveSuccess]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-fs-14 font-mono text-text-muted animate-pulse">
          Loading Card Editor...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg-main text-text-main overflow-hidden text-left">
      {/* Top Header Bar */}
      <div className="flex-none px-6 py-4 bg-bg-card border-b border-border-btn flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('flashcards')}
            className="p-1.5 rounded-lg bg-bg-track hover:bg-border-btn/50 text-text-muted hover:text-text-main transition-colors font-mono text-fs-12"
          >
            ← Cancel
          </button>
          <div>
            <h1 className="text-fs-18 font-bold text-text-main tracking-tight">
              {cardId ? 'Edit Flashcard' : 'Create New Flashcard'}
            </h1>
            <p className="text-fs-11 text-text-muted font-mono">
              Press <kbd className="px-1.5 py-0.5 rounded bg-bg-track border border-border-btn text-text-main">⌘+Enter</kbd> to save
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Selector */}
          <div className="flex items-center p-1 rounded-xl bg-bg-track border border-border-btn text-fs-12 font-mono">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                viewMode === 'split' ? 'bg-accent text-white font-semibold' : 'text-text-muted hover:text-text-main'
              }`}
            >
              Split View
            </button>
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                viewMode === 'edit' ? 'bg-accent text-white font-semibold' : 'text-text-muted hover:text-text-main'
              }`}
            >
              Editor Only
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                viewMode === 'preview' ? 'bg-accent text-white font-semibold' : 'text-text-muted hover:text-text-main'
              }`}
            >
              Card Preview
            </button>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : cardId ? 'Update Flashcard' : 'Save Flashcard'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex-none px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-fs-12 font-mono flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {error}
        </div>
      )}

      {/* Settings Bar */}
      <div className="flex-none px-6 py-3 bg-bg-card-grad-start border-b border-border-btn/60 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <label className="text-fs-12 font-mono text-text-muted">Target Deck:</label>
          <select
            value={form.deckId}
            onChange={(e) => setForm({ ...form, deckId: e.target.value })}
            className="px-3 py-1.5 bg-bg-track border border-border-btn rounded-xl text-fs-12 text-text-main focus:outline-none focus:border-accent"
          >
            <option value="">(General / Unassigned)</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-fs-12 font-mono text-text-muted">Topic Tag:</label>
          <input
            type="text"
            placeholder="e.g. Dynamic Programming, Graphs"
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value })}
            className="px-3 py-1.5 bg-bg-track border border-border-btn rounded-xl text-fs-12 text-text-main focus:outline-none focus:border-accent w-48"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-fs-12 font-mono text-text-muted">Type:</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="px-3 py-1.5 bg-bg-track border border-border-btn rounded-xl text-fs-12 text-text-main focus:outline-none focus:border-accent"
          >
            <option value="concept">Concept</option>
            <option value="problem">Problem Solution</option>
          </select>
        </div>

        {/* Formatting Toolbar */}
        <div className="ml-auto flex items-center gap-1.5 bg-bg-track p-1 rounded-xl border border-border-btn">
          <span className="text-fs-10 font-mono text-text-muted px-2 uppercase border-r border-border-btn/60">
            Format ({activeField}):
          </span>
          <button
            type="button"
            onClick={() => applyFormat('**', '**')}
            title="Bold"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-12 font-bold text-text-main"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => applyFormat('*', '*')}
            title="Italic"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-12 italic text-text-main"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => applyFormat('`', '`')}
            title="Inline Code"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-11 font-mono text-accent"
          >
            `code`
          </button>
          <button
            type="button"
            onClick={() => applyFormat('\n```python\n', '\n```\n')}
            title="Code Block"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-11 font-mono text-emerald-400"
          >
            ```block```
          </button>
          <button
            type="button"
            onClick={() => applyFormat('\n- ')}
            title="Bullet List"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-12 text-text-main"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => applyFormat('\n### ')}
            title="Heading"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-12 font-bold text-text-main"
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => applyFormat('$', '$')}
            title="LaTeX Math Formula"
            className="px-2 py-1 hover:bg-border-btn/60 rounded text-fs-11 font-mono text-amber-400"
          >
            $f(x)$
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Editor Panes */}
        {(viewMode === 'split' || viewMode === 'edit') && (
          <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border-btn/60 overflow-hidden">
            {/* Front Side Editor */}
            <div className="flex-1 p-6 flex flex-col min-h-0 bg-bg-card-grad-start">
              <div className="flex items-center justify-between mb-2">
                <label className="text-fs-13 font-bold text-text-main flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block" />
                  Front Side (Prompt / Question)
                </label>
                <span className="font-mono text-fs-10 text-text-muted">
                  Markdown & text supported
                </span>
              </div>

              <textarea
                ref={frontRef}
                value={form.front}
                onFocus={() => setActiveField('front')}
                onChange={(e) => setForm({ ...form, front: e.target.value })}
                placeholder="Type your question, prompt, or problem statement here...&#10;&#10;e.g. What is the time complexity of building a heap from an unsorted array of N elements?"
                className="flex-1 w-full p-4 bg-bg-track border border-border-btn rounded-2xl text-fs-14 text-text-main focus:outline-none focus:border-accent resize-none font-sans leading-relaxed custom-scrollbar shadow-inner"
              />
            </div>

            {/* Back Side Editor */}
            <div className="flex-1 p-6 flex flex-col min-h-0 bg-bg-card-grad-start">
              <div className="flex items-center justify-between mb-2">
                <label className="text-fs-13 font-bold text-text-main flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  Back Side (Answer / Solution / Code)
                </label>
                <span className="font-mono text-fs-10 text-text-muted">
                  Code blocks & details supported
                </span>
              </div>

              <textarea
                ref={backRef}
                value={form.back}
                onFocus={() => setActiveField('back')}
                onChange={(e) => setForm({ ...form, back: e.target.value })}
                placeholder="Type the detailed answer, explanation, or code snippet...&#10;&#10;e.g. O(N) using Floyd's heapify algorithm (bottom-up construction).&#10;&#10;```python&#10;def build_heap(arr):&#10;    for i in range(len(arr)//2 - 1, -1, -1):&#10;        sift_down(arr, i)&#10;```"
                className="flex-1 w-full p-4 bg-bg-track border border-border-btn rounded-2xl text-fs-13 font-mono text-text-main focus:outline-none focus:border-accent resize-none leading-relaxed custom-scrollbar shadow-inner"
              />
            </div>
          </div>
        )}

        {/* Live Card Preview Pane */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div
            className={`${
              viewMode === 'split' ? 'w-full md:w-[440px] flex-none' : 'flex-1'
            } border-l border-border-btn bg-bg-main p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border-btn/60">
              <span className="font-mono text-fs-11 text-accent font-semibold tracking-wider uppercase">
                LIVE CARD PREVIEW
              </span>
              <span className="font-mono text-fs-10 text-text-muted uppercase">
                {form.tag} · {form.type}
              </span>
            </div>

            {/* Front Card Mock */}
            <div className="bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn rounded-2xl p-6 shadow-card flex flex-col justify-between min-h-[200px]">
              <div className="flex items-center justify-between mb-3 text-fs-10 font-mono text-text-muted">
                <span>FRONT (PROMPT)</span>
                <span>CARD PREVIEW</span>
              </div>
              <div className="text-fs-16 font-semibold text-text-main leading-relaxed py-4 text-center">
                <FormattedText content={form.front} />
              </div>
              <div className="text-center pt-2">
                <span className="inline-block px-3 py-1 rounded-full bg-accent/15 text-accent text-fs-11 font-mono font-medium">
                  Show Answer ↵
                </span>
              </div>
            </div>

            {/* Back Card Mock */}
            <div className="bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-accent/40 rounded-2xl p-6 shadow-card flex flex-col justify-between min-h-[220px]">
              <div className="flex items-center justify-between mb-3 text-fs-10 font-mono text-accent">
                <span>BACK (ANSWER)</span>
                <span>FLIPPED PREVIEW</span>
              </div>
              <div className="text-fs-13 text-text-main bg-bg-track/60 border border-border-btn/60 rounded-xl p-4 overflow-x-auto leading-relaxed my-2">
                <FormattedText content={form.back} />
              </div>
              <div className="text-fs-10 font-mono text-text-muted text-center pt-2">
                Evaluated with FSRS spaced repetition
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
