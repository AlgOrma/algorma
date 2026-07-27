import React, { useEffect, useId, useState } from 'react';
import * as api from '../api';
import Button from '../components/common/Button';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="6.5" r="3.2" />
    <path d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5" />
  </svg>
);

const IconMail = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="14" height="10" rx="2" />
    <path d="M3.5 6l6.5 5 6.5-5" />
  </svg>
);

const IconLock = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="9" width="11" height="8" rx="2" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);

const IconEye = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" />
    <circle cx="10" cy="10" r="2.5" />
  </svg>
);

const IconEyeOff = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 2l16 16" />
    <path d="M8.2 8.2a2.5 2.5 0 0 0 3.5 3.5" />
    <path d="M6 6.3C3.6 7.7 1.5 10 1.5 10S4.5 15.5 10 15.5c1.2 0 2.3-.26 3.3-.7" />
    <path d="M13.7 13.2C16.2 11.8 18.5 10 18.5 10S15.5 4.5 10 4.5c-.5 0-1 .05-1.5.15" />
  </svg>
);

const IconGoogle = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const IconGitHub = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

// Captured at import time: on a failed OAuth round-trip the backend redirects
// to the frontend with ?error=<code>, but App's URL-sync effect rewrites the
// address bar (dropping the query string) on its very first commit — before
// this screen has mounted. Reading it here, before React renders anything, is
// the only reliable window.
let pendingOAuthError = new URLSearchParams(window.location.search).get('error');

// Brand logo + wordmark, sized for the panel (lg) or the compact header (sm).
function Brand({ size = 'lg' }) {
  const box = size === 'lg' ? 'w-[30px] h-[30px] rounded-[7px] text-fs-14' : 'w-7 h-7 rounded-md text-fs-13';
  const word = size === 'lg' ? 'text-[17px]' : 'text-fs-15';
  return (
    <div className="flex items-center gap-sp-10">
      <div className={`${box} bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center font-mono font-semibold text-text-dark`}>
        ›_
      </div>
      <span className={`${word} font-extrabold tracking-[-0.015em] bg-gradient-to-r from-accent to-accent-secondary bg-clip-text text-transparent`}>
        AlgOrma
      </span>
    </div>
  );
}

function FeatureRow({ icon, children }) {
  return (
    <div className="flex items-center gap-3.5">
      <div
        className="w-[38px] h-[38px] flex-none rounded-[9px] flex items-center justify-center text-accent"
        style={{
          background: 'color-mix(in srgb, var(--color-accent) 14%, #0a0a0a)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 26%, transparent)'
        }}
      >
        {icon}
      </div>
      <span className="text-fs-14-5 text-[#e5e5e5] font-semibold">{children}</span>
    </div>
  );
}

// One labeled input with a leading icon and an optional password-visibility
// toggle (rendered whenever onToggleShow is provided).
function Field({ label, icon, labelRight, shown, onToggleShow, ...inputProps }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-sp-7">
        <label htmlFor={id} className="block font-mono text-fs-10-5 text-text-muted tracking-[0.05em] uppercase">{label}</label>
        {labelRight}
      </div>
      <div className="relative flex items-center">
        <span className="absolute left-[13px] flex text-[#555] pointer-events-none">{icon}</span>
        <input
          id={id}
          className={`auth-input w-full bg-bg-code border border-border-main rounded-[10px] py-3 pl-10 ${
            onToggleShow ? 'pr-[42px]' : 'pr-3.5'
          } text-text-main text-fs-14 font-sans outline-none transition-[border-color,box-shadow] duration-150`}
          {...inputProps}
        />
        {onToggleShow && (
          <button
            type="button"
            onClick={onToggleShow}
            aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 bg-transparent cursor-pointer text-[#666] p-sp-7 flex items-center transition-colors duration-150 hover:text-white"
          >
            {shown ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Login / sign-up screen (FEATURES.auth). Full-screen, no sidebar: a brand
 * panel on wide viewports and the form panel beside it. SSO buttons appear
 * only for providers the backend reports as configured, so a bare self-hosted
 * instance shows email/password alone.
 *
 * Calls `onAuthed(user)` once the server confirms a session.
 */
export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);

  // Which SSO buttons to show. A failure (e.g. the auth backend isn't
  // deployed, or SSO isn't configured) just means email/password only.
  useEffect(() => {
    let cancelled = false;
    api.getAuthProviders()
      .then((list) => { if (!cancelled && Array.isArray(list)) setProviders(list); })
      .catch(() => { /* no SSO */ });
    return () => { cancelled = true; };
  }, []);

  // Surface the OAuth error captured at import time — once. (App may have
  // already rewritten the URL; scrub the parameter only if it's still there.)
  useEffect(() => {
    if (!pendingOAuthError) return;
    pendingOAuthError = null;
    setError('Single sign-on didn’t complete. Try again, or use your password.');
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      params.delete('error');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  const switchMode = (next) => () => {
    // A submit is in flight — switching now would land its error (and the
    // disabled state) under the other form.
    if (submitting) return;
    setMode(next);
    setError('');
    setShowLoginPw(false);
    setShowRegPw(false);
  };

  const finish = async (call) => {
    setError('');
    setSubmitting(true);
    try {
      const authed = await call();
      // What normally ends a submit is onAuthed unmounting this screen, so a
      // 2xx that carries no usable profile (a proxy swallowing the body,
      // contract drift) would strand the form disabled with nothing shown.
      // Treat it as a failure instead of trusting the status code.
      if (!authed?.id) {
        setError('The server didn’t return your profile. Please try again.');
        return;
      }
      onAuthed(authed);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      // Released even on success: the re-enable is invisible in the frame
      // before onAuthed unmounts us, and it's the only guarantee the form
      // can't wedge.
      setSubmitting(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!identifier.trim() || !loginPassword) {
      setError('Enter your email and password to log in.');
      return;
    }
    finish(() => api.login({ identifier: identifier.trim(), password: loginPassword, remember }));
  };

  const handleRegister = (e) => {
    e.preventDefault();
    const name = regName.trim();
    const email = regEmail.trim();
    if (!name) return setError('Pick a username to continue.');
    if (!EMAIL_RE.test(email)) return setError('That email doesn’t look right.');
    if (regPassword.length < 8) return setError('Your password needs at least 8 characters.');
    finish(() => api.register({ name, email, password: regPassword }));
  };

  const startOAuth = (provider) => () => {
    window.location.href = api.oauthAuthorizeUrl(provider);
  };

  const isLogin = mode === 'login';

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg-main text-text-main">
      {/* Brand panel — hidden on narrow viewports, where the form header
          carries the logo instead. */}
      <div className="hidden lg:flex flex-[1.15] relative overflow-hidden px-[52px] py-[46px] flex-col border-r border-[#141414] min-w-0">
        <div
          className="absolute top-[-160px] right-[-120px] w-[460px] h-[460px] rounded-full blur-[20px] pointer-events-none"
          style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 26%, transparent), transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-180px] left-[-100px] w-[380px] h-[380px] rounded-full blur-[20px] pointer-events-none"
          style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-accent-secondary) 16%, transparent), transparent 70%)' }}
        />

        <div className="relative">
          <Brand />
        </div>

        <div className="my-auto relative max-w-[440px]">
          <div className="font-mono text-fs-11 tracking-[0.14em] text-accent uppercase">
            Spaced repetition for algorithms
          </div>
          <h1 className="text-[38px] leading-[1.12] font-extrabold tracking-[-0.02em] mt-4 mb-0 text-balance">
            Remember every pattern you solve.
          </h1>
          <p className="text-fs-15 leading-[1.6] text-text-mid mt-4 mb-[34px] max-w-[400px]">
            Log your problems once, and AlgOrma brings each one back for review right before you’d forget it.
          </p>

          <div className="flex flex-col gap-4">
            <FeatureRow
              icon={
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3l7 3.5-7 3.5-7-3.5L10 3z" />
                  <path d="M3 10.5l7 3.5 7-3.5" />
                  <path d="M3 14l7 3.5 7-3.5" />
                </svg>
              }
            >
              Every problem, organized in one bank
            </FeatureRow>
            <FeatureRow
              icon={
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l2.6 1.6" />
                </svg>
              }
            >
              Reviews scheduled the moment you forget
            </FeatureRow>
            <FeatureRow
              icon={
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7" />
                  <circle cx="10" cy="10" r="2.8" />
                </svg>
              }
            >
              Turn solutions into reusable patterns
            </FeatureRow>
          </div>
        </div>

        <div className="relative flex items-center gap-3 pt-[22px] border-t border-[#161616]">
          <div className="flex gap-sp-4 items-center">
            <div className="w-sp-7 h-sp-14 rounded-sm bg-[#1a1a1a]" />
            <div className="w-sp-7 h-sp-14 rounded-sm bg-[#262626]" />
            <div className="w-sp-7 h-sp-14 rounded-sm bg-accent-secondary/40" />
            <div className="w-sp-7 h-sp-14 rounded-sm bg-accent/65" />
            <div className="w-sp-7 h-sp-14 rounded-sm bg-accent" />
            <div className="w-sp-7 h-sp-14 rounded-sm bg-accent" />
          </div>
          <span className="font-mono text-fs-11-5 text-[#777]">Your streak starts today.</span>
        </div>
      </div>

      {/* Form panel. Centered via m-auto (not items-center) so that when the
          form is taller than a short viewport, the top stays scrollable
          instead of being clipped past the scroll container's start edge. */}
      <div className="flex-1 min-w-0 flex px-8 py-10 bg-[#070707] overflow-y-auto">
        <div key={mode} className="m-auto w-full max-w-[392px] auth-fade">
          <div className="lg:hidden mb-7">
            <Brand size="sm" />
          </div>

          <h2 className="text-[26px] font-extrabold tracking-[-0.02em] m-0">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-fs-14 text-text-muted mt-2 mb-sp-26">
            {isLogin ? 'Log in to keep your review streak alive.' : 'Start mastering algorithms in minutes.'}
          </p>

          {providers.length > 0 && (
            <>
              <div className="flex flex-col gap-2.5">
                {providers.includes('google') && (
                  <button type="button" onClick={startOAuth('google')} className="auth-sso auth-sso-google">
                    <IconGoogle />
                    <span>Continue with Google</span>
                  </button>
                )}
                {providers.includes('github') && (
                  <button type="button" onClick={startOAuth('github')} className="auth-sso auth-sso-github">
                    <IconGitHub />
                    <span>Continue with GitHub</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3.5 my-[22px]">
                <div className="flex-1 h-px bg-[#1e1e1e]" />
                <span className="font-mono text-fs-10-5 tracking-[0.08em] text-[#666] uppercase">
                  or continue with email
                </span>
                <div className="flex-1 h-px bg-[#1e1e1e]" />
              </div>
            </>
          )}

          {isLogin ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Field
                label="Email or username"
                icon={<IconUser />}
                type="text"
                autoComplete="username"
                placeholder="you@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <Field
                label="Password"
                labelRight={
                  /* Password reset ships later (see AUTH_DESIGN.md "Out of
                     scope"); keep the affordance but mark it unavailable. */
                  <button
                    type="button"
                    aria-disabled="true"
                    title="Password reset is coming soon"
                    className="bg-transparent p-0 font-mono text-fs-10-5 text-accent hover:text-white cursor-help"
                  >
                    Forgot?
                  </button>
                }
                icon={<IconLock />}
                type={showLoginPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                shown={showLoginPw}
                onToggleShow={() => setShowLoginPw((v) => !v)}
              />

              <label className="flex items-center gap-[9px] cursor-pointer text-fs-13 text-[#bcbcbc] select-none -mt-0.5">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-[15px] h-[15px] accent-accent cursor-pointer"
                />
                Remember me for 30 days
              </label>

              {error && <div role="alert" className="text-fs-12 text-[#ff6b6b]">{error}</div>}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="w-full mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Logging in…' : 'Log in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <Field
                label="Username"
                icon={<IconUser />}
                type="text"
                autoComplete="username"
                placeholder="algo_wizard"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
              <Field
                label="Email"
                icon={<IconMail />}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
              <Field
                label="Password"
                icon={<IconLock />}
                type={showRegPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                shown={showRegPw}
                onToggleShow={() => setShowRegPw((v) => !v)}
              />

              {error && <div role="alert" className="text-fs-12 text-[#ff6b6b]">{error}</div>}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="w-full mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          )}

          {isLogin ? (
            <p className="text-center text-fs-13-5 text-text-muted mt-6 mb-0">
              Don’t have an account?{' '}
              <button
                type="button"
                onClick={switchMode('register')}
                className="bg-transparent p-0 font-bold text-fs-13-5 text-accent hover:text-white cursor-pointer"
              >
                Sign up
              </button>
            </p>
          ) : (
            <>
              {/* Terms/Privacy pages don't exist yet — accent-emphasized text,
                  not links, until they do. */}
              <p className="text-fs-11-5 leading-[1.5] text-[#666] text-center mt-4 mb-0">
                By signing up you agree to our{' '}
                <span className="text-accent">Terms</span> and{' '}
                <span className="text-accent">Privacy Policy</span>.
              </p>
              <p className="text-center text-fs-13-5 text-text-muted mt-[18px] mb-0">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={switchMode('login')}
                  className="bg-transparent p-0 font-bold text-fs-13-5 text-accent hover:text-white cursor-pointer"
                >
                  Log in
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
