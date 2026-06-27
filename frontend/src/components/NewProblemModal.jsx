import React, { useState } from 'react';
import Button from './common/Button';

export default function NewProblemModal({ 
  isOpen, 
  onClose, 
  onSave, 
  themeColor = 'var(--color-accent)' 
}) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('Easy');
  const [status, setStatus] = useState('Not started');
  const [statement, setStatement] = useState('');
  const [exIn, setExIn] = useState('');
  const [exOut, setExOut] = useState('');
  const [approach, setApproach] = useState('');
  const [solution, setSolution] = useState('');
  const [notes, setNotes] = useState('');
  const [patternsInput, setPatternsInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!title || !topic) {
      alert('Please fill out the Title and Topic.');
      return;
    }

    const patterns = patternsInput
      ? patternsInput.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    const newProblem = {
      id: 'p_' + Date.now(),
      title,
      topic,
      difficulty,
      status,
      due: status !== 'Done', // completed items are not immediately due
      statement,
      exIn,
      exOut,
      approach,
      solution,
      notes,
      patterns,
      created: 'just now',
      lastRevised: '—',
      nextLabel: status === 'Done' ? 'in 6 days' : 'today',
      nextColor: status === 'Done' ? 'var(--color-text-muted)' : themeColor,
      dueMeta: status === 'Done' ? 'completed' : 'not started',
      revisions: 0
    };

    onSave(newProblem);
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setTopic('');
    setDifficulty('Easy');
    setStatus('Not started');
    setStatement('');
    setExIn('');
    setExOut('');
    setApproach('');
    setSolution('');
    setNotes('');
    setPatternsInput('');
  };

  return (
    <div className="fixed inset-0 bg-bg-overlay/80 backdrop-blur-[4px] flex items-center justify-center z-[1000] p-5">
      <div className="w-full max-w-[680px] bg-bg-main border border-border-main rounded-2xl shadow-modal flex flex-col max-h-[90vh] text-left">
        {/* Modal Header */}
        <div className="px-6 py-sp-18 border-b border-border-subtle flex items-center justify-between">
          <span className="text-fs-18 font-bold text-text-main">
            Add new problem
          </span>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="bg-transparent border-none text-text-muted text-fs-20 cursor-pointer leading-none"
          >
            ✕
          </button>
        </div>

        {/* Modal Scroll Content */}
        <form 
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto flex flex-col gap-4 custom-scrollbar"
        >
          {/* Title & Topic row */}
          <div className="grid grid-cols-[1.2fr_1fr] gap-sp-14">
            <div className="flex flex-col gap-1.5">
              <label className="text-fs-12 text-text-muted font-mono">TITLE *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., Merge Overlapping Ranges"
                className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full transition-colors duration-200"
                required
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-fs-12 text-text-muted font-mono">TOPIC *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="E.g., Arrays"
                className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full transition-colors duration-200"
                required
              />
            </div>
          </div>

          {/* Difficulty & Status row */}
          <div className="grid grid-cols-2 gap-sp-14">
            <div className="flex flex-col gap-1.5">
              <label className="text-fs-12 text-text-muted font-mono">DIFFICULTY</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full cursor-pointer transition-colors duration-200"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-fs-12 text-text-muted font-mono">STATUS</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full cursor-pointer transition-colors duration-200"
              >
                <option value="Not started">Not started</option>
                <option value="Solving">Solving</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>

          {/* Statement */}
          <div className="flex flex-col gap-1.5">
            <label className="text-fs-12 text-text-muted font-mono">PROBLEM STATEMENT</label>
            <textarea
              rows={3}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Enter problem description..."
              className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full resize-y transition-colors duration-200"
            />
          </div>

          {/* Examples */}
          <div className="grid grid-cols-2 gap-sp-14">
            <div className="flex flex-col gap-1.5">
              <label className="text-fs-12 text-text-muted font-mono">EXAMPLE INPUT</label>
              <input
                type="text"
                value={exIn}
                onChange={(e) => setExIn(e.target.value)}
                placeholder="E.g., nums = [2, 7], target = 9"
                className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full transition-colors duration-200"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-fs-12 text-text-muted font-mono">EXAMPLE OUTPUT</label>
              <input
                type="text"
                value={exOut}
                onChange={(e) => setExOut(e.target.value)}
                placeholder="E.g., [0, 1]"
                className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full transition-colors duration-200"
              />
            </div>
          </div>

          {/* Approach */}
          <div className="flex flex-col gap-1.5">
            <label className="text-fs-12 text-text-muted font-mono">MY APPROACH</label>
            <textarea
              rows={2}
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
              placeholder="Outline your approach steps..."
              className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full resize-y transition-colors duration-200"
            />
          </div>

          {/* Code Solution */}
          <div className="flex flex-col gap-1.5">
            <label className="text-fs-12 text-text-muted font-mono">CODE SOLUTION</label>
            <textarea
              rows={4}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="function solve() { ... }"
              className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-12 font-mono outline-none w-full resize-y transition-colors duration-200"
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-fs-12 text-text-muted font-mono">NOTES &amp; LEARNINGS</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key learnings or off-by-one pitfalls..."
              className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full resize-y transition-colors duration-200"
            />
          </div>

          {/* Linked Patterns */}
          <div className="flex flex-col gap-1.5">
            <label className="text-fs-12 text-text-muted font-mono">LINKED PATTERNS</label>
            <input
              type="text"
              value={patternsInput}
              onChange={(e) => setPatternsInput(e.target.value)}
              placeholder="Comma-separated patterns, e.g., Hash Map, Sorting, Two Pointers"
              className="bg-bg-card border border-border-main focus:border-accent rounded-lg px-3 py-2.5 text-text-main text-fs-13 outline-none w-full transition-colors duration-200"
            />
          </div>

          {/* Form Actions Footer */}
          <div className="mt-2.5 flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { resetForm(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit">
              Save problem
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
