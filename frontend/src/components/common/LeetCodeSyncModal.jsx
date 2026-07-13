import React, { useEffect, useState } from 'react';
import Button from './Button';
import * as api from '../../api';

// Sync solved LeetCode problems into the personal bank. Two modes:
// - username only → recent accepted submissions (public API, ~20 most recent)
// - LEETCODE_SESSION cookie → the full accepted history in one pass
export default function LeetCodeSyncModal({ isOpen, onClose, onSynced }) {
  const [username, setUsername] = useState('');
  const [cookie, setCookie] = useState('');
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Fresh form each open, prefilled with the profile's remembered username.
  useEffect(() => {
    if (!isOpen) return;
    setCookie('');
    setError(null);
    setResult(null);
    setSyncing(false);
    api
      .getMe()
      .then((me) => setUsername((u) => u || me.leetcodeUsername || ''))
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSync = async () => {
    if (!username.trim() && !cookie.trim()) {
      setError('Enter your LeetCode username or a LEETCODE_SESSION cookie.');
      return;
    }
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.syncLeetCode({
        username: username.trim() || undefined,
        sessionCookie: cookie.trim() || undefined
      });
      setResult(res);
      setCookie('');
      if (onSynced) onSynced();
    } catch (err) {
      setError(err.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const fullMode = Boolean(cookie.trim());

  return (
    <div className="fixed inset-0 bg-bg-overlay/80 backdrop-blur-[4px] flex items-center justify-center z-[2000] p-5 animate-fade-in">
      <div className="w-full max-w-[480px] bg-bg-main border border-border-main rounded-md shadow-modal flex flex-col text-left overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <span className="text-fs-15 font-semibold text-text-main font-mono tracking-wider">
            SYNC FROM LEETCODE
          </span>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-text-muted text-fs-16 cursor-pointer leading-none hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4 text-fs-13 text-text-muted leading-relaxed">
          {result ? (
            <div className="flex flex-col gap-3">
              <div className="text-text-main text-fs-14 font-semibold">
                Synced {result.matched} solved problem{result.matched === 1 ? '' : 's'} for{' '}
                <span className="text-accent">{result.username}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-fs-11-5">
                <div className="bg-bg-card border border-border-main rounded-lg p-3 text-center">
                  <div className="text-fs-18 text-green-400 font-bold">{result.imported}</div>
                  <div className="mt-1">imported as Done</div>
                </div>
                <div className="bg-bg-card border border-border-main rounded-lg p-3 text-center">
                  <div className="text-fs-18 text-accent font-bold">{result.markedDone}</div>
                  <div className="mt-1">marked Done</div>
                </div>
                <div className="bg-bg-card border border-border-main rounded-lg p-3 text-center">
                  <div className="text-fs-18 text-text-hover font-bold">{result.alreadyDone}</div>
                  <div className="mt-1">already Done</div>
                </div>
              </div>
              {result.unmatched.length > 0 && (
                <div className="text-fs-12">
                  {result.unmatched.length} solved question
                  {result.unmatched.length === 1 ? ' wasn’t' : 's weren’t'} found in the local
                  catalog and {result.unmatched.length === 1 ? 'was' : 'were'} skipped.
                </div>
              )}
              {result.mode === 'recent' && (
                <div className="text-fs-12 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-lg p-3">
                  Username sync only covers your most recent accepted submissions (~20). To pull
                  in your full solve history, sync again with a LEETCODE_SESSION cookie.
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="m-0">
                Pull your accepted LeetCode solutions into your problem bank — each one is
                imported (or updated) as <strong className="text-text-main">Done</strong>.
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-border-accent tracking-[0.05em]">
                  LEETCODE USERNAME
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. jane_doe"
                  className="bg-bg-card border border-border-main rounded-card-btn px-3 py-2 text-text-main text-fs-13 outline-none focus:border-accent transition-colors"
                />
                <span className="text-fs-11 text-text-muted">
                  Username alone syncs only your ~20 most recent accepted submissions.
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-border-accent tracking-[0.05em]">
                  LEETCODE_SESSION COOKIE — FULL HISTORY (OPTIONAL)
                </span>
                <input
                  type="password"
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  placeholder="Paste cookie value for a full sync (e.g. all 300 solved)"
                  className="bg-bg-card border border-border-main rounded-card-btn px-3 py-2 text-text-main text-fs-13 outline-none focus:border-accent transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCookieHelp((v) => !v)}
                  className="bg-transparent border-none p-0 text-left text-fs-11 text-accent cursor-pointer hover:underline"
                >
                  {showCookieHelp ? '▲ Hide' : '▼ How do I find this?'}
                </button>
                {showCookieHelp && (
                  <ol className="m-0 pl-4 text-fs-11-5 flex flex-col gap-1 list-decimal">
                    <li>Log in at leetcode.com, then open DevTools (F12).</li>
                    <li>
                      Go to <span className="font-mono">Application → Cookies → leetcode.com</span>{' '}
                      (Firefox: Storage → Cookies).
                    </li>
                    <li>
                      Copy the value of <span className="font-mono">LEETCODE_SESSION</span> and
                      paste it above.
                    </li>
                    <li>
                      It’s used for this one sync and never stored. Treat it like a password —
                      don’t share it anywhere else.
                    </li>
                  </ol>
                )}
              </label>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-fs-12">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#080808] border-t border-border-subtle flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} size="sm">
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing…' : fullMode ? 'Sync Full History' : 'Sync Recent'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
