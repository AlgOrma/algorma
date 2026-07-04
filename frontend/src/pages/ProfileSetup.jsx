import React, { useState } from 'react';
import Button from '../components/common/Button';

// Daily-problem goal choices offered in the setup form
const GOAL_OPTIONS = [1, 2, 3, 4, 5, 7, 10, 15, 20, 25, 30];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formFromUser(user) {
  return {
    name: user?.name || '',
    email: user?.email || '',
    dailyGoal: user?.dailyGoal || 10,
    bio: user?.bio || ''
  };
}

/**
 * First-run setup / edit-profile screen. Rendered full-screen (no sidebar).
 * In edit mode it pre-fills from the existing user and shows a Cancel button.
 */
export default function ProfileSetup({ user = null, isEditing = false, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => formFromUser(user));
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = (key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    if (key === 'name') setNameError('');
    if (key === 'email') setEmailError('');
  };

  const handleSubmit = async () => {
    const name = (form.name || '').trim();
    if (!name) {
      setNameError('Please enter a name to continue.');
      return;
    }
    const email = (form.email || '').trim();
    if (email && !EMAIL_RE.test(email)) {
      setEmailError('That email doesn’t look right.');
      return;
    }

    setServerError('');
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        email: email || null,
        timezone: user?.timezone || 'UTC',
        dailyGoal: form.dailyGoal || 10,
        bio: (form.bio || '').trim() || null
      });
      // On success the setup screen unmounts, so there's no state to reset here.
    } catch (err) {
      setServerError(err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const title = isEditing ? 'Edit your profile' : 'Set up your profile';
  const subtitle = isEditing
    ? 'Update your details — your problem history and review schedule stay intact.'
    : 'Let’s tune AlgOrma to you. Set your daily pace and turn steady reps into algorithms that actually stick.';
  const submitLabel = isEditing ? 'Save changes' : 'Enter AlgOrma →';

  const inputClasses =
    'bg-bg-code border border-border-main rounded-card-btn px-sp-12 py-sp-11 text-text-main text-fs-14 outline-none w-full focus:border-accent transition-colors';

  return (
    <div className="relative min-h-screen w-full bg-bg-main flex justify-center overflow-y-auto px-8 py-sp-40">
      {/* Soft accent glow behind the card */}
      <div
        className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[560px] h-[340px] pointer-events-none"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--theme-accent) 16%, transparent), transparent)'
        }}
      />

      <div className="relative m-auto w-full max-w-[496px] bg-bg-card border border-border-main rounded-[18px] px-sp-30 pt-sp-30 pb-sp-26 shadow-modal">
        {/* Brand */}
        <div className="flex items-center gap-sp-10">
          <div className="w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center font-mono text-fs-13 font-semibold text-text-dark">
            ›_
          </div>
          <span className="font-bold text-fs-15 text-text-main tracking-[-0.01em]">AlgOrma</span>
        </div>

        <div className="text-fs-22 font-bold text-text-main tracking-[-0.015em] mt-sp-20">{title}</div>
        <div className="text-fs-13 leading-[1.6] text-text-mid mt-sp-7">{subtitle}</div>

        <div className="flex flex-col gap-sp-15 mt-sp-22">
          {/* Name */}
          <div className="flex flex-col gap-sp-7">
            <label className="font-mono text-fs-10 tracking-[0.06em] text-text-muted">
              YOUR NAME <span className="text-accent">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Sam Rivera"
              className={inputClasses}
            />
            {nameError && <span className="text-fs-11-5 text-accent-red-hover">{nameError}</span>}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-sp-7">
            <label className="font-mono text-fs-10 tracking-[0.06em] text-text-muted">
              EMAIL <span className="text-border-accent">· optional</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="you@domain.com"
              className={inputClasses}
            />
            {emailError && <span className="text-fs-11-5 text-accent-red-hover">{emailError}</span>}
          </div>

          {/* Daily goal */}
          <div className="flex flex-col gap-sp-7">
            <label className="font-mono text-fs-10 tracking-[0.06em] text-text-muted">
              HOW MANY PROBLEMS A DAY?
            </label>
            <div className="relative">
              <select
                value={form.dailyGoal}
                onChange={(e) => setField('dailyGoal', parseInt(e.target.value, 10) || 1)}
                className="bg-bg-code border border-border-main rounded-card-btn pl-sp-12 pr-sp-30 py-sp-11 text-text-main text-fs-14 outline-none w-full appearance-none cursor-pointer focus:border-accent transition-colors"
              >
                {GOAL_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-sp-11 top-1/2 -translate-y-1/2 pointer-events-none"
                width="12"
                height="12"
                viewBox="0 0 20 20"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="5 8 10 13 15 8" />
              </svg>
            </div>
          </div>

          {/* Bio */}
          <div className="flex flex-col gap-sp-7">
            <label className="font-mono text-fs-10 tracking-[0.06em] text-text-muted">
              BIO <span className="text-border-accent">· optional</span>
            </label>
            <textarea
              value={form.bio}
              onChange={(e) => setField('bio', e.target.value)}
              rows={2}
              placeholder="What are you grinding toward?"
              className="bg-bg-code border border-border-main rounded-card-btn px-sp-12 py-sp-11 text-text-main text-fs-14 leading-[1.5] outline-none w-full font-sans resize-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {serverError && (
          <div className="mt-sp-20 text-fs-12 text-accent-red-hover">{serverError}</div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          variant="primary"
          className="w-full mt-sp-22 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : submitLabel}
        </Button>

        {isEditing && (
          <Button
            onClick={onCancel}
            variant="secondary"
            className="w-full mt-sp-9"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
