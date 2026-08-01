import { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { useGameSounds } from './hooks/useGameSounds';
import { useVoiceChat } from './hooks/useVoiceChat';

// ─── API ───────────────────────────────────────────────────────────────────────
const API = '/api';
async function api(method: string, path: string, body?: any, token?: string) {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── PLAYING CARD ──────────────────────────────────────────────────────────────
const SUIT_ICON: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_TXT: Record<number, string> = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
const RED_SUITS = new Set(['H', 'D']);

function PlayingCard({ card, small, glow }: { card: any; small?: boolean; glow?: boolean }) {
  const color = RED_SUITS.has(card.s) ? '#e53e3e' : '#1a202c';
  const rank = RANK_TXT[card.r] || '?';
  if (small) return (
    <div className="rounded-[4px] bg-white border border-gray-200 shadow-md flex flex-col justify-between px-[3px] py-[2px]" style={{ width: 30, height: 42, color, fontSize: 9, lineHeight: '11px', fontWeight: 700, boxShadow: glow ? '0 0 8px rgba(251,191,36,0.6)' : undefined }}>
      <div>{rank}<br />{SUIT_ICON[card.s]}</div>
      <div style={{ transform: 'rotate(180deg)' }}>{rank}<br />{SUIT_ICON[card.s]}</div>
    </div>
  );
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-xl flex flex-col justify-between px-2 py-1.5" style={{ width: 54, height: 76, color, fontWeight: 700, fontSize: 13, lineHeight: '16px', boxShadow: glow ? '0 0 16px rgba(251,191,36,0.7), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)' }}>
      <div>{rank}<br />{SUIT_ICON[card.s]}</div>
      <div className="text-center text-2xl leading-none">{SUIT_ICON[card.s]}</div>
      <div style={{ transform: 'rotate(180deg)' }}>{rank}<br />{SUIT_ICON[card.s]}</div>
    </div>
  );
}

function CardBack({ small, rotate }: { small?: boolean; rotate?: string }) {
  return (
    <div className="rounded-lg vp-card-back border border-white/20 shadow-md"
      style={{ width: small ? 30 : 54, height: small ? 42 : 76, transform: rotate || undefined }} />
  );
}

// ─── AUTH VIEW ────────────────────────────────────────────────────────────────
function pwStrength(p: string): { score: number; label: string; color: string } {
  let score = 0;
  if (p.length >= 6) score++;
  if (p.length >= 10) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  return { score, label: labels[score] || '', color: colors[score] || '#ef4444' };
}

function AuthView({ onAuth }: { onAuth: (tok: string, user: any) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = pwStrength(password);
  const usernameOk = /^[a-z0-9_]{3,20}$/.test(username);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'signup') {
      if (!usernameOk) return void toast.error('Username must be 3–20 chars, only letters/numbers/underscore');
      if (password.length < 6) return void toast.error('Password must be at least 6 characters');
      if (password !== confirm) return void toast.error('Passwords do not match');
    }
    setBusy(true);
    try {
      const d = await api('POST', `/auth/${mode}`, { username, password });
      onAuth(d.token, d.user);
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen casino-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="font-display text-3xl font-bold text-amber-400 tracking-wider">TEEN PATTI</h1>
          <p className="text-white/40 text-sm mt-1">RISK LAB</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex mb-6 bg-black/30 rounded-xl p-1 gap-1">
            {(['login','signup'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setPassword(''); setConfirm(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${mode === m ? 'bg-amber-500 text-black' : 'text-white/60 hover:text-white'}`}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            {/* Username */}
            <div>
              <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                placeholder="Username" autoCapitalize="none" autoComplete="username" maxLength={20}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 transition-colors" />
              {mode === 'signup' && username.length > 0 && (
                <p className={`text-xs mt-1 px-1 ${usernameOk ? 'text-green-400' : 'text-red-400'}`}>
                  {usernameOk ? '✓ Username looks good' : 'Only letters, numbers, underscore (3–20 chars)'}
                </p>
              )}
            </div>
            {/* Password */}
            <div>
              <div className="relative">
                <input value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" type={showPw ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 transition-colors" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-sm transition-colors select-none">
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
              {mode === 'signup' && password.length > 0 && (
                <div className="mt-2 px-1">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ background: i <= strength.score ? strength.color : 'rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                  {strength.label && <p className="text-xs" style={{ color: strength.color }}>{strength.label}</p>}
                </div>
              )}
            </div>
            {/* Confirm password (signup only) */}
            {mode === 'signup' && (
              <div className="relative">
                <input value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Confirm password" type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 transition-colors" />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-sm transition-colors select-none">
                  {showConfirm ? '🙈' : '👁️'}
                </button>
                {confirm.length > 0 && (
                  <p className={`text-xs mt-1 px-1 ${confirm === password ? 'text-green-400' : 'text-red-400'}`}>
                    {confirm === password ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>
            )}
            <button disabled={busy} className="w-full bg-gradient-to-r from-amber-600 to-amber-400 hover:from-amber-500 hover:to-amber-300 text-black font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-900/30 disabled:opacity-50">
              {busy ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
function Lobby({ user, token, onJoinTable, onShowFriends, onShowStats, chipCount, onLogout }: any) {
  const [tables, setTables] = useState<any[]>([]);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', isPublic: true, boot: 10, maxPlayers: 6 });
  const [profileOpen, setProfileOpen] = useState(false);
  const avatarKey = `tp_avatar_${user.id}`;
  const [avatar, setAvatar] = useState<string | null>(() => user.avatarUrl || localStorage.getItem(avatarKey));
  const fileRef = useRef<HTMLInputElement>(null);

  function pickPhoto() { fileRef.current?.click(); }
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5 MB'); return; }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(objectUrl); toast.error('Could not read image'); };
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const MAX = 200;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      localStorage.setItem(avatarKey, dataUrl);
      setAvatar(dataUrl);
      api('POST', '/me/avatar', { avatarUrl: dataUrl }, token)
        .then(() => toast.success('Profile photo updated!'))
        .catch(() => toast.error('Failed to save photo'));
    };
    img.src = objectUrl;
  }

  useEffect(() => {
    const load = () => api('GET', '/tables').then(d => setTables(d.tables || [])).catch(() => {});
    load(); const t = setInterval(load, 5000); return () => clearInterval(t);
  }, []);

  async function joinCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { const d = await api('POST', '/tables/join', { code }, token); onJoinTable(d.table); }
    catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function create() {
    setBusy(true);
    try { const d = await api('POST', '/tables', form, token); onJoinTable(d.table); }
    catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function joinPublic(code: string) {
    setBusy(true);
    try { const d = await api('POST', '/tables/join', { code }, token); onJoinTable(d.table); }
    catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen casino-bg flex flex-col">
      {/* Top bar */}
      <div className="nav-pill mx-3 mt-3 px-4 py-3 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🃏</span>
          <span className="font-display font-bold text-amber-400 text-sm tracking-wider">TEEN PATTI</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onShowFriends} className="text-white/60 hover:text-white transition-colors text-lg">👥</button>
          <button onClick={onShowStats} className="text-white/60 hover:text-white transition-colors text-lg">📊</button>
          <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/25 rounded-lg px-2.5 py-1">
            <span className="text-amber-400 text-xs">🪙</span>
            <span className="text-amber-300 font-mono font-bold text-sm">₹{chipCount.toLocaleString()}</span>
          </div>
          {/* Profile button */}
          <div className="relative">
            <button onClick={() => setProfileOpen(v => !v)} className="w-9 h-9 rounded-full overflow-hidden border-2 border-amber-500/50 hover:border-amber-400 transition-colors flex items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700">
              {avatar
                ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-black font-bold text-xs">{user.username.slice(0,2).toUpperCase()}</span>}
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-11 w-60 bg-[#0d1f15] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  {/* Photo + username */}
                  <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center gap-3">
                    <button onClick={() => { pickPhoto(); setProfileOpen(false); }}
                      className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-500/50 hover:border-amber-400 transition-colors flex items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700 relative group flex-shrink-0">
                      {avatar
                        ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                        : <span className="text-black font-bold text-sm">{user.username.slice(0,2).toUpperCase()}</span>}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                        <span className="text-white text-xs">📷</span>
                      </div>
                    </button>
                    <div className="min-w-0">
                      <div className="text-white font-semibold text-sm truncate">@{user.username}</div>
                      <button onClick={() => { pickPhoto(); setProfileOpen(false); }}
                        className="text-amber-400 text-xs hover:text-amber-300 transition-colors mt-0.5">
                        {avatar ? 'Change photo' : '+ Add photo'}
                      </button>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="p-2">
                    <button onClick={() => { setProfileOpen(false); onShowStats(); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-white/70 hover:bg-white/5 hover:text-white text-sm transition-colors flex items-center gap-2">
                      📊 My Stats
                    </button>
                    {avatar && (
                      <button onClick={() => { localStorage.removeItem(avatarKey); setAvatar(null); setProfileOpen(false); api('POST', '/me/avatar', { avatarUrl: null }, token).catch(() => {}); toast.success('Photo removed'); }}
                        className="w-full text-left px-3 py-2 rounded-xl text-white/70 hover:bg-white/5 hover:text-white text-sm transition-colors flex items-center gap-2">
                        🗑️ Remove photo
                      </button>
                    )}
                    <div className="border-t border-white/10 my-1" />
                    <button onClick={() => { setProfileOpen(false); onLogout(); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-red-400 hover:bg-red-950/40 text-sm transition-colors flex items-center gap-2 font-semibold">
                      🚪 Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll px-4 pb-6 space-y-4 mt-4">
        {/* Quick join */}
        <form onSubmit={joinCode} className="flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Enter room code" maxLength={6}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50 font-mono tracking-widest uppercase text-center" />
          <button disabled={busy || code.length < 6} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 rounded-xl disabled:opacity-40 transition-colors">JOIN</button>
        </form>
        {/* Create table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <button onClick={() => setShowCreate(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-white/80 hover:text-white transition-colors">
            <span className="font-semibold">+ Create Private Table</span>
            <span className="text-white/40">{showCreate ? '▲' : '▼'}</span>
          </button>
          {showCreate && (
            <div className="px-4 pb-4 space-y-3 border-t border-white/10">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={`${user.username}'s table`}
                className="w-full mt-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50 text-sm" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1 block">Boot ₹</label>
                  <input
                    type="number" min={1} max={100000}
                    value={form.boot}
                    onChange={e => setForm(f => ({ ...f, boot: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="e.g. 50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1 block">Max Players</label>
                  <select value={form.maxPlayers} onChange={e => setForm(f => ({ ...f, maxPlayers: +e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                    {[3,4,5,6].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} className="accent-amber-500" />
                <span className="text-white/70 text-sm">Public (listed in lobby)</span>
              </label>
              <button onClick={create} disabled={busy} className="w-full bg-gradient-to-r from-amber-600 to-amber-400 text-black font-bold py-2.5 rounded-xl transition-all disabled:opacity-50">
                {busy ? 'Creating...' : 'Create Table'}
              </button>
            </div>
          )}
        </div>
        {/* Friends shortcut */}
        <button onClick={onShowFriends} className="w-full flex items-center gap-3 bg-white/5 border border-white/10 hover:border-amber-500/30 hover:bg-white/8 rounded-2xl px-4 py-3 transition-colors text-left">
          <span className="text-2xl">👥</span>
          <div className="flex-1">
            <div className="text-white/80 font-semibold text-sm">Friends</div>
            <div className="text-white/40 text-xs mt-0.5">Add friends · join their table</div>
          </div>
          <span className="text-white/30 text-sm">›</span>
        </button>

        {/* Public tables */}
        {tables.length > 0 && (
          <div>
            <h3 className="text-white/50 text-xs uppercase tracking-wider mb-2 px-1">Public Tables</h3>
            <div className="space-y-2">
              {tables.map(t => (
                <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold text-sm">{t.name}</div>
                    <div className="text-white/40 text-xs mt-0.5">Boot ₹{t.boot} · {t.players}/{t.maxPlayers} players</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === 'in_hand' && <span className="text-red-400 text-xs font-semibold">IN HAND</span>}
                    <button onClick={() => joinPublic(t.code)} disabled={busy} className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Join</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STATS VIEW ───────────────────────────────────────────────────────────────
function StatsView({ user, token, onClose }: any) {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    api('GET', '/stats', undefined, token).then(setStats).catch(() => {});
  }, [token]);
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <h2 className="text-white font-bold text-lg">Your Stats</h2>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl">×</button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[['Chips', `₹${stats.chips.toLocaleString()}`, 'text-amber-400'],['Net P&L', `₹${stats.netPnL.toLocaleString()}`, stats.netPnL >= 0 ? 'text-green-400' : 'text-red-400'],
                ['Hands', stats.handsPlayed,'text-white'],['Win Rate', `${(stats.winRate*100).toFixed(1)}%`,'text-sky-400']].map(([label, val, cls]) => (
                <div key={label as string} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-white/40 text-xs mb-1">{label}</div>
                  <div className={`text-xl font-bold font-mono ${cls}`}>{val}</div>
                </div>
              ))}
            </div>
            {stats.chart?.length > 1 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <div className="text-white/40 text-xs mb-2">Cumulative P&L</div>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={stats.chart}>
                    <Area type="monotone" dataKey="cumulative" stroke="#F59E0B" fill="rgba(245,158,11,0.1)" strokeWidth={2} dot={false} />
                    <Tooltip formatter={(v: any) => [`₹${v}`, 'Cumulative']} contentStyle={{ background: '#111', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }} labelFormatter={() => ''} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : <div className="text-white/40 text-center py-12">Loading…</div>}
      </div>
    </div>
  );
}

// ─── FRIENDS VIEW ─────────────────────────────────────────────────────────────
function FriendsView({ user, token, onClose, onJoinFriendTable, notifCount }: any) {
  const [friends, setFriends] = useState<any[]>([]);
  const [addName, setAddName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('GET', '/friends', undefined, token).then(d => setFriends(d.friends || [])).catch(() => {}), [token]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function addFriend() {
    if (!addName.trim()) return; setBusy(true);
    try { await api('POST', '/friends/add', { username: addName }, token); toast.success('Friend request sent!'); setAddName(''); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function requestJoin(fid: string) {
    setBusy(true);
    try { await api('POST', '/friends/request-join', { friendId: fid }, token); toast.success('Join request sent!'); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2"><h2 className="text-white font-bold text-lg">Friends</h2>{notifCount > 0 && <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{notifCount}</span>}</div>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl">×</button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
        <div className="flex gap-2">
          <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Add friend by username"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50 text-sm" />
          <button onClick={addFriend} disabled={busy} className="bg-amber-500 text-black font-bold px-4 rounded-xl text-sm disabled:opacity-50">Add</button>
        </div>
        {friends.length === 0 && <p className="text-white/30 text-center py-8">No friends yet. Add someone!</p>}
        {friends.map(f => (
          <div key={f.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-800 flex items-center justify-center text-black font-bold text-sm">
                {f.username.slice(0, 2).toUpperCase()}
              </div>
              {f.online && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black" />}
            </div>
            <div className="flex-1">
              <div className="text-white font-semibold text-sm">{f.username}</div>
              <div className="text-white/40 text-xs">₹{f.chips.toLocaleString()}{f.atTable ? ` · Playing ${f.atTable.name}` : ''}</div>
            </div>
            {f.atTable?.hasEmptySeat && (
              <button onClick={() => requestJoin(f.id)} disabled={busy} className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50">
                Request Join
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NOTIFICATIONS HUB ────────────────────────────────────────────────────────
function NotificationsHub({ user, token, onJoinTable }: any) {
  const [notifs, setNotifs] = useState<any[]>([]);
  useEffect(() => {
    const load = () => api('GET', '/notifications', undefined, token).then(d => setNotifs(d.notifications || [])).catch(() => {});
    load(); const t = setInterval(load, 4000); return () => clearInterval(t);
  }, [token]);

  async function respond(id: string, accept: boolean) {
    const n = notifs.find((n: any) => n.id === id);
    try {
      const d = await api('POST', '/notifications/respond', { id, accept }, token);
      if (accept && n?.type === 'table_join_request') setNotifs(ns => ns.filter(x => x.id !== id));
      if (accept && n?.type === 'join_accepted') {
        const td = await api('GET', `/tables/${n.tableId}/state`, undefined, token);
        onJoinTable(td.table);
      }
    } catch (e: any) { toast.error(e.message); }
    setNotifs(ns => ns.filter(x => x.id !== id));
  }
  async function dismiss(id: string) {
    await api('POST', '/notifications/dismiss', { id }, token).catch(() => {});
    setNotifs(ns => ns.filter(x => x.id !== id));
  }

  const actionable = notifs.filter((n: any) => n.status === 'pending' && (n.type === 'friend_request' || n.type === 'table_join_request'));
  const info = notifs.filter((n: any) => n.type === 'join_accepted' || n.type === 'join_declined' || n.type === 'friend_accepted');

  if (!actionable.length && !info.length) return null;
  return (
    <div className="fixed top-16 right-4 z-50 space-y-2 max-w-[320px]">
      {[...actionable, ...info].slice(0, 4).map((n: any) => {
        const isActionCard = n.type === 'friend_request' || n.type === 'table_join_request';
        const cardBg = isActionCard ? 'bg-[#1a0d0d] border-red-800/60' : 'bg-[#0d1a0d] border-green-800/40';
        return (
        <div key={n.id} className={`${cardBg} border rounded-xl p-3 shadow-2xl backdrop-blur-sm`}>
          <p className="text-white text-sm mb-2">{n.message}</p>
          {isActionCard ? (
            <div className="flex gap-2">
              <button onClick={() => respond(n.id, true)} className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs font-bold py-1.5 rounded-lg transition-colors">Accept</button>
              <button onClick={() => respond(n.id, false)} className="flex-1 bg-red-900/60 hover:bg-red-800/60 text-white/80 text-xs font-bold py-1.5 rounded-lg transition-colors">Decline</button>
            </div>
          ) : (
            <button onClick={() => { if (n.type === 'join_accepted') respond(n.id, true); else dismiss(n.id); }} className="w-full bg-amber-600/30 text-amber-400 text-xs font-bold py-1.5 rounded-lg hover:bg-amber-600/50 transition-colors">
              {n.type === 'join_accepted' ? 'Join Table →' : 'OK'}
            </button>
          )}
        </div>
        );
      })}
    </div>
  );
}

// ─── VEGAS SEAT ───────────────────────────────────────────────────────────────
function VegasSeat({ seat, posStyle, isLeft, table, myUserId, firstActSeat, isSpeaking, isInVoice }: any) {
  if (!seat) return null;
  const isTurn = table.status === 'in_hand' && table.turnIdx === seat.seat && !table.pendingSideshow;
  const isSideshowReq = table.pendingSideshow?.requesterSeat === seat.seat;
  const isSideshowTgt = table.pendingSideshow?.targetSeat === seat.seat;
  const isDealer = table.status !== 'lobby' && table.dealerIdx === seat.seat;
  const isWinner = table.winnerIdx === seat.seat && table.status === 'showdown';
  const statusLabel = !seat.inHand ? null : seat.folded ? 'PACK' : seat.seen ? 'SEEN' : 'BLIND';
  const statusColor = statusLabel === 'PACK' ? 'bg-red-900/70 text-red-300 border-red-800/50' : statusLabel === 'SEEN' ? 'bg-blue-900/70 text-blue-300 border-blue-800/50' : 'bg-amber-900/70 text-amber-300 border-amber-800/50';
  const now = Date.now();
  const timerSec = isTurn && seat.seat === table.turnIdx && table.turnStartedAt
    ? Math.max(0, 15 - Math.round((now - table.turnStartedAt) / 1000))
    : null;

  return (
    <div className={`absolute flex flex-col items-center gap-0.5 ${seat.folded ? 'opacity-50' : ''} no-tap-highlight z-10`} style={posStyle}>
      {statusLabel && (
        <div className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider mb-[-2px] z-20 ${statusColor}`}>{statusLabel}</div>
      )}
      {isSideshowTgt && (
        <div className="px-1.5 py-0.5 rounded-full border border-amber-600/60 bg-amber-900/60 text-amber-300 text-[9px] font-bold uppercase tracking-wider mb-[-2px] z-20">SIDESHOW?</div>
      )}
      {isSideshowReq && (
        <div className="px-1.5 py-0.5 rounded-full border border-amber-600/60 bg-amber-900/60 text-amber-300 text-[9px] font-bold uppercase tracking-wider mb-[-2px] z-20">ASKED</div>
      )}
      {/* Face-down cards behind avatar */}
      {seat.inHand && !seat.folded && !seat.cards && (
        <div className={`flex mb-[-18px] z-0 ${isLeft ? 'translate-x-2' : '-translate-x-2'}`}>
          {[0, 1, 2].map(i => (
            <div key={i} className="w-8 h-11 rounded-sm vp-card-back border border-white/20 shadow-md"
              style={{ marginLeft: i > 0 ? -14 : 0, transform: `rotate(${(i - 1) * 12}deg)` }} />
          ))}
        </div>
      )}
      {/* Revealed cards */}
      {seat.inHand && !seat.folded && seat.cards && (
        <div className="flex gap-0.5 mb-[-2px] z-10">
          {seat.cards.map((c: any, i: number) => <PlayingCard key={i} card={c} small glow={isWinner} />)}
        </div>
      )}
      {/* Avatar with turn ring */}
      <div className="relative z-10">
        {isTurn && (
          <svg className="absolute inset-0 -m-[4px] pointer-events-none" width="68" height="68" viewBox="0 0 68 68" style={{ animation: 'spin 2s linear infinite' }}>
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F59E0B" /><stop offset="100%" stopColor="#78350F" />
              </linearGradient>
            </defs>
            <circle cx="34" cy="34" r="31" fill="none" stroke="rgba(15,23,42,0.4)" strokeWidth="4" />
            <circle cx="34" cy="34" r="31" fill="none" stroke="url(#ringGrad)" strokeWidth="4"
              strokeDasharray={2 * Math.PI * 31}
              strokeDashoffset={timerSec != null ? (1 - timerSec / 15) * 2 * Math.PI * 31 : 0}
              transform="rotate(-90 34 34)" strokeLinecap="round" />
          </svg>
        )}
        {isSpeaking && (
          <div className="absolute inset-0 -m-[3px] rounded-full border-2 border-red-500 z-30 pointer-events-none"
            style={{ animation: 'pulse-glow 0.6s ease-in-out infinite', boxShadow: '0 0 10px rgba(52,211,153,0.7)' }} />
        )}
        <div className={`w-[60px] h-[60px] rounded-full flex items-center justify-center overflow-hidden border-[2.5px] shadow-lg text-[22px] font-bold ${isWinner ? 'border-amber-400 shadow-amber-400/40' : isSpeaking ? 'border-red-500' : 'border-white/20'}`}
          style={{ background: `linear-gradient(135deg, hsl(${(seat.username.charCodeAt(0) * 40) % 360}, 50%, 35%), hsl(${(seat.username.charCodeAt(0) * 40 + 40) % 360}, 60%, 20%))` }}>
          {seat.avatarUrl
            ? <img src={seat.avatarUrl} alt={seat.username} className="w-full h-full object-cover" />
            : <span className="text-white/80">{seat.username.slice(0, 2).toUpperCase()}</span>}
        </div>
        {isInVoice && !isSpeaking && (
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] z-30">🎙️</div>
        )}
        {isWinner && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-lg" style={{ animation: 'bounce 1s infinite' }}>👑</div>
        )}
        {isDealer && (
          <div className={`absolute -bottom-1 ${isLeft ? '-right-2' : '-left-2'} bg-white text-black text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-gray-400 shadow-md z-20`}>D</div>
        )}
      </div>
      {/* Name plate */}
      <div className="bg-black/80 rounded-full px-2.5 py-0.5 mt-[-8px] z-30 flex flex-col items-center backdrop-blur-sm border border-white/10 shadow-md min-w-[65px]">
        <span className="text-[#FFF8F0] text-[9px] font-semibold uppercase tracking-wide truncate max-w-[60px]">{seat.username}</span>
        <span className="text-amber-400 font-mono text-[10px] font-bold">₹{seat.chips.toLocaleString()}</span>
      </div>
      {seat.chipsInPot > 0 && (
        <div className="text-[9px] text-amber-300/70 font-mono tracking-tight">+₹{seat.chipsInPot}</div>
      )}
      {seat.handLabel && (
        <div className="text-[8px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-1.5 py-0.5 rounded border border-amber-600/40 text-center">{seat.handLabel}</div>
      )}
    </div>
  );
}

// Seat layout positions for up to 5 opponents around the Vegas Pro Max oval
// Order: top-center first, then top-left, top-right, mid-left, mid-right
// Counter-clockwise order from user's bottom seat so ascending seat index = left → top → right
// Seat 1 → mid-left (first to act, closest to user's left)
// Seat 2 → top-left
// Seat 3 → top-center
// Seat 4 → top-right
// Seat 5 → mid-right (last to act before user)
const SEAT_POSITIONS = [
  { top: 208, left: 4, isLeft: true  },   // 0: mid-left   (seat +1 from user, acts 1st)
  { top: 72,  left: 4, isLeft: true  },   // 1: top-left   (acts 2nd)
  { top: 5,   left: '50%', transform: 'translateX(-50%)', isLeft: false }, // 2: top-center (acts 3rd)
  { top: 72,  right: 4, isLeft: false },  // 3: top-right  (acts 4th)
  { top: 208, right: 4, isLeft: false },  // 4: mid-right  (acts 5th)
];

// ─── VEGAS TABLE VIEW ─────────────────────────────────────────────────────────
function VegasTableView({ tableInit, user, token, onLeave, onRefreshChips, userAvatar }: any) {
  const [table, setTable] = useState<any>(tableInit);
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [sideshowModal, setSideshowModal] = useState(false);
  const [sideshowRevealDismissed, setSideshowRevealDismissed] = useState(false);
  const [sideshowResultDismissed, setSideshowResultDismissed] = useState(false);
  const pollingRef = useRef<any>(null);
  const lastVersionRef = useRef(tableInit.version);

  // ── Animation state ──────────────────────────────────────────────────────────
  type FlyCard = { id: number; fromX: number; fromY: number; toX: number; toY: number; delay: number; rot: number };
  type FlyChip = { id: number; fromX: number; fromY: number; toX: number; toY: number };
  const [flyCards, setFlyCards] = useState<FlyCard[]>([]);
  const [flyChips, setFlyChips] = useState<FlyChip[]>([]);
  const [flyTipChips, setFlyTipChips] = useState<FlyChip[]>([]);
  const [tipFlash, setTipFlash] = useState<{ name: string; amount: number } | null>(null);
  const [firstActFlash, setFirstActFlash] = useState<string | null>(null);
  const [firstActSeat, setFirstActSeat] = useState<number>(-1);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const DEALER_NAMES = ['Ravi', 'Maya', 'Arjun', 'Priya', 'Kabir', 'Zara', 'Dev', 'Aisha'];
  const dealerPersonName = DEALER_NAMES[(table.code?.charCodeAt(0) ?? 0) % DEALER_NAMES.length];
  const prevTableRef = useRef<any>(tableInit);
  const animIdRef = useRef(0);
  const sounds = useGameSounds();

  // ── Voice chat ────────────────────────────────────────────────────────────────
  const voice = useVoiceChat(tableInit.id, user.id, token);

  const poll = useCallback(async () => {
    try {
      const d = await api('GET', `/tables/${table.id}/state`, undefined, token);
      setTable(d.table);
      if (d.table.version !== lastVersionRef.current) lastVersionRef.current = d.table.version;
    } catch { /* ignore */ }
  }, [table.id, token]);

  useEffect(() => {
    pollingRef.current = setInterval(poll, 1200); return () => clearInterval(pollingRef.current);
  }, [poll]);

  // Sideshow modal when I'm the target
  const myIdx = table.seats.findIndex((s: any) => s && s.userId === user.id);
  const mySeat = myIdx >= 0 ? table.seats[myIdx] : null;
  const isMyTurn = table.status === 'in_hand' && table.turnIdx === myIdx && !table.pendingSideshow;
  const iAmSideshowTarget = table.pendingSideshow?.targetSeat === myIdx;
  const sideshowRevealSeats: [number, number] | null = (table.sideshowRevealSeats as [number, number]) ?? null;
  const iAmInSideshowReveal = sideshowRevealSeats ? sideshowRevealSeats.includes(myIdx) : false;

  useEffect(() => {
    if (iAmSideshowTarget && !sideshowModal) setSideshowModal(true);
  }, [iAmSideshowTarget]);

  // Auto-dismiss sideshow card reveal after 3s; reset when a new reveal starts
  const sideshowRevealKey = sideshowRevealSeats ? sideshowRevealSeats.join(',') : '';
  useEffect(() => {
    if (!iAmInSideshowReveal) return;
    setSideshowRevealDismissed(false);
    const t = setTimeout(() => setSideshowRevealDismissed(true), 3000);
    return () => clearTimeout(t);
  }, [sideshowRevealKey, iAmInSideshowReveal]);

  // Reset result-flash dismiss when a new sideshow result arrives
  const sideshowResultKey = (table.sideshowResult as any)?.at ?? 0;
  useEffect(() => {
    setSideshowResultDismissed(false);
  }, [sideshowResultKey]);

  const activeCount = table.seats.filter((s: any) => s && s.inHand && !s.folded).length;

  async function doAction(type: string) {
    if (busy) return; setBusy(true);
    if (type === 'chaal') sounds.playChaal();
    else if (type === 'pack') sounds.playPack();
    else if (type === 'double') sounds.playRaise();
    else if (type === 'show') sounds.playShow();
    else if (type === 'sideshow') sounds.playSideshow();
    try { const d = await api('POST', `/tables/${table.id}/action`, { type }, token); setTable(d.table); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function doSeeCards() {
    if (busy) return; setBusy(true);
    sounds.playSeeCards();
    try { const d = await api('POST', `/tables/${table.id}/see`, {}, token); setTable(d.table); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function doTip(amount: number) {
    if (busy) return; setBusy(true);
    sounds.playTip();
    try {
      const d = await api('POST', `/tables/${table.id}/tip`, { amount }, token);
      setTable(d.table);
      toast.success(`💸 Tipped dealer ₹${amount}!`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function doSideshow(accept: boolean) {
    if (busy) return; setBusy(true); setSideshowModal(false);
    if (accept) sounds.playSideshowAccept(); else sounds.playSideshowDecline();
    try { const d = await api('POST', `/tables/${table.id}/sideshow`, { accept }, token); setTable(d.table); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function doStart() {
    if (busy) return; setBusy(true);
    try {
      const d = await api('POST', `/tables/${table.id}/start`, {}, token);
      setTable(d.table); onRefreshChips();
      sounds.playDeal(d.table.seats.filter((s: any) => s && s.inHand).length || 4);
    }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function doLeave() {
    await api('POST', `/tables/${table.id}/leave`, {}, token).catch(() => {});
    await onRefreshChips(); onLeave();
  }
  async function sendChat(e: React.FormEvent) {
    e.preventDefault(); if (!chatMsg.trim()) return;
    try { await api('POST', `/tables/${table.id}/chat`, { message: chatMsg }, token); setChatMsg(''); await poll(); }
    catch (e: any) { toast.error(e.message); }
  }

  // Map opponents
  const opponents = table.seats
    .map((s: any, idx: number) => ({ s, idx }))
    .filter(({ s, idx }: any) => s !== null && idx !== myIdx);
  // Rotate so next seat after me comes first
  const dealerName = table.dealerIdx >= 0 ? table.seats[table.dealerIdx]?.username : null;
  const pot = table.pot || 0;
  const totalOccupied = table.seats.filter((s: any) => s).length;

  // Compute action costs
  const stake = table.currentStake || table.boot;
  const blindCost = stake;
  const seenCost = 2 * stake;
  const blindRaiseCost = 2 * stake;
  const seenRaiseCost = 4 * stake;
  const showCost = mySeat ? (mySeat.isBlind ? stake : 2 * stake) : 0;
  const canSideshow = mySeat?.seen && activeCount >= 3 && (table.turnCount || 0) >= activeCount;

  const timerSec = isMyTurn && table.turnStartedAt
    ? Math.max(0, 15 - Math.round((Date.now() - table.turnStartedAt) / 1000))
    : null;

  // ── Pixel coords for animations (390×844 container) ──────────────────────────
  // Dealer figure center (top of table, above oval)
  const DEALER_PX = { x: 195, y: 78 };
  // Pot pill center (inside oval felt)
  const POT_PX = { x: 195, y: 328 };
  // Opponent seat avatar centers by posIdx (counter-clockwise: mid-left → top-left → top-center → top-right → mid-right)
  const OPP_PX = [
    { x: 68,  y: 404 }, // posIdx 0 – mid-left
    { x: 68,  y: 268 }, // posIdx 1 – top-left
    { x: 195, y: 200 }, // posIdx 2 – top-center
    { x: 322, y: 268 }, // posIdx 3 – top-right
    { x: 322, y: 404 }, // posIdx 4 – mid-right
  ];
  const MY_PX = { x: 195, y: 632 };

  function getSeatPx(seatIdx: number): { x: number; y: number } {
    if (seatIdx === myIdx) return MY_PX;
    const oppIdxList = table.seats
      .map((s: any, i: number) => ({ s, i }))
      .filter(({ s, i }: any) => s !== null && i !== myIdx)
      .map(({ i }: any) => i);
    const posIdx = oppIdxList.indexOf(seatIdx);
    return posIdx >= 0 && posIdx < 5 ? OPP_PX[posIdx] : POT_PX;
  }

  // ── Trigger animations on table changes ──────────────────────────────────────
  useEffect(() => {
    const prev = prevTableRef.current;
    const curr = table;
    const nextId = () => ++animIdRef.current;

    // Winner sound: showdown just reached
    if (curr.status === 'showdown' && curr.winnerIdx >= 0 && prev.status !== 'showdown') {
      sounds.playWinner();
      setFirstActSeat(-1); // clear first-act badge when hand ends
    }

    // ── Sounds for OTHER players' actions (own-action sounds fire on button press) ──

    if (curr.status === 'in_hand' && curr.handId === prev.handId) {
      // Another player folded/packed
      (curr.seats as any[]).forEach((seat: any, i: number) => {
        const prevSeat = (prev.seats as any[])[i];
        if (i !== myIdx && prevSeat && seat && prevSeat.inHand && !prevSeat.folded && seat.folded) {
          sounds.playPack();
        }
      });

      // Another player bet (chaal) or raised (double)
      if (
        (curr.pot ?? 0) > (prev.pot ?? 0) &&
        prev.turnIdx >= 0 &&
        prev.turnIdx !== myIdx &&
        prev.status === 'in_hand'
      ) {
        const stake = curr.currentStake || curr.boot || 10;
        const potDelta = (curr.pot ?? 0) - (prev.pot ?? 0);
        if (potDelta > 2 * stake) {
          sounds.playRaise();
        } else {
          sounds.playChaal();
        }
      }

      // Another player peeked at their cards
      (curr.seats as any[]).forEach((seat: any, i: number) => {
        const prevSeat = (prev.seats as any[])[i];
        if (i !== myIdx && prevSeat && seat && !prevSeat.seen && seat.seen) {
          sounds.playSeeCards();
        }
      });
    }

    // Another player requested a sideshow (prev.turnIdx is the requester)
    if (curr.pendingSideshow && !prev.pendingSideshow && prev.turnIdx !== myIdx) {
      sounds.playSideshow();
    }

    // New hand started → first-to-act flash + deal animation (merged to avoid early-return blocking)
    if (curr.handId && curr.handId !== prev.handId && curr.status === 'in_hand') {
      // First-to-act flash
      const firstSeat = curr.turnIdx as number;
      setFirstActSeat(firstSeat);
      const firstName = firstSeat === myIdx ? 'You' : (curr.seats[firstSeat]?.username ?? 'Player');
      setFirstActFlash(firstSeat === myIdx ? '🎯 You go first!' : `${firstName} goes first`);
      const flashTimer = setTimeout(() => setFirstActFlash(null), 2800);

      // Deal animation: fly 3 cards to each player from dealer position
      const occupied = (curr.seats as any[])
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s && s.inHand);
      const cards: FlyCard[] = [];
      let delay = 0;
      for (let round = 0; round < 3; round++) {
        for (const { i } of occupied) {
          const to = getSeatPx(i);
          cards.push({ id: nextId(), fromX: DEALER_PX.x, fromY: DEALER_PX.y, toX: to.x, toY: to.y, delay, rot: 0 });
          delay += 115;
        }
      }
      setFlyCards(cards);
      const cardTimer = setTimeout(() => setFlyCards([]), delay + 600);

      return () => { clearTimeout(flashTimer); clearTimeout(cardTimer); };
    }

    // Chip animation: pot grew in the same hand (player bet/raised)
    if (
      curr.status === 'in_hand' &&
      curr.handId === prev.handId &&
      (curr.pot ?? 0) > (prev.pot ?? 0) &&
      prev.turnIdx >= 0 &&
      prev.status === 'in_hand'
    ) {
      const actorIdx = prev.turnIdx as number;
      const from = getSeatPx(actorIdx);
      const amount = (curr.pot ?? 0) - (prev.pot ?? 0);
      const numCoins = Math.min(4, Math.max(1, Math.ceil(amount / (curr.boot || 10))));
      const chips: FlyChip[] = Array.from({ length: numCoins }, (_, c) => ({
        id: nextId(),
        fromX: from.x + (c - Math.floor(numCoins / 2)) * 9,
        fromY: from.y - 4,
        toX: POT_PX.x + (c % 2 === 0 ? 4 : -4),
        toY: POT_PX.y,
      }));
      setFlyChips(prev => [...prev, ...chips]);
      const ids = chips.map(c => c.id);
      const tid = setTimeout(() => setFlyChips(prev => prev.filter(c => !ids.includes(c.id))), 850);
      return () => clearTimeout(tid);
    }

    // ── Tip animation: detect new "X tipped the dealer ₹Y" log entries ──────────
    {
      const prevLogs = (prev.log || []) as string[];
      const currLogs = (curr.log || []) as string[];
      if (currLogs.length > prevLogs.length) {
        const newEntries = currLogs.slice(prevLogs.length);
        for (const entry of newEntries) {
          const tipMatch = (entry as string).match(/^(.+) tipped the dealer ₹(\d+) 💸$/);
          if (tipMatch) {
            const tipperName = tipMatch[1];
            const tipAmt = parseInt(tipMatch[2]);
            // Play sound for OTHER players (tipper already played it on button press)
            const tipperSeatIdx = (curr.seats as any[]).findIndex((s: any) => s && s.username === tipperName);
            if (tipperSeatIdx >= 0 && tipperSeatIdx !== myIdx) sounds.playTip();
            // Fly chips from tipper's seat to dealer figure
            const fromPos = tipperSeatIdx >= 0 ? getSeatPx(tipperSeatIdx) : MY_PX;
            const numCoins = Math.min(8, Math.max(3, Math.ceil(tipAmt / 15)));
            const tipChips: FlyChip[] = Array.from({ length: numCoins }, (_, c) => ({
              id: nextId(),
              fromX: fromPos.x + (c - Math.floor(numCoins / 2)) * 11,
              fromY: fromPos.y - 4,
              toX: DEALER_PX.x + ((c % 3) - 1) * 8,
              toY: DEALER_PX.y + 28,
            }));
            setFlyTipChips(prev => [...prev, ...tipChips]);
            const tipIds = tipChips.map(tc => tc.id);
            setTimeout(() => setFlyTipChips(p => p.filter(tc => !tipIds.includes(tc.id))), 1500);
            // Show tip flash badge visible to all players
            setTipFlash({ name: tipperName, amount: tipAmt });
            setTimeout(() => setTipFlash(null), 3400);
          }
        }
      }
    }

    prevTableRef.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  // Keep prevTableRef current between renders (not just after effect)
  useEffect(() => { prevTableRef.current = table; });

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-4px)} }
        @keyframes pulse-glow { 0%,100%{box-shadow:0 0 20px rgba(245,158,11,0.3)} 50%{box-shadow:0 0 40px rgba(245,158,11,0.7)} }
        @keyframes winner-pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
        @keyframes fadeInOut {
          0%   { opacity:0; transform:translateY(6px) scale(0.92); }
          12%  { opacity:1; transform:translateY(0) scale(1); }
          78%  { opacity:1; }
          100% { opacity:0; transform:translateY(-4px) scale(0.95); }
        }
        @keyframes flyCard {
          0%   { transform: translate(0,0) scale(1.05); opacity: 1; }
          75%  { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0; }
        }
        @keyframes flyChip {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          42%  { transform: translate(calc(var(--cx)*0.5), calc(var(--cy)*0.42 - 38px)) scale(1.35); opacity: 1; }
          100% { transform: translate(var(--cx), var(--cy)) scale(0.28); opacity: 0; }
        }
        @keyframes flyTipChip {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          30%  { transform: translate(calc(var(--tx)*0.38), calc(var(--ty)*0.32 - 72px)) scale(1.55); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.45); opacity: 0; }
        }
        @keyframes tipFlashAnim {
          0%   { opacity:0; transform:translateX(-50%) scale(0.85) translateY(6px); }
          14%  { opacity:1; transform:translateX(-50%) scale(1.06) translateY(0); }
          22%  { transform:translateX(-50%) scale(1) translateY(0); }
          78%  { opacity:1; }
          100% { opacity:0; transform:translateX(-50%) scale(0.95) translateY(-5px); }
        }
      `}</style>
      <div className="relative overflow-hidden no-tap-highlight" style={{ width: 390, height: 844, background: '#051a0f', fontFamily: "'Source Sans 3', sans-serif" }}>

        {/* ── FIRST-TO-ACT FLASH BANNER ── */}
        {firstActFlash && (
          <div className="absolute inset-x-0 flex justify-center pointer-events-none"
            style={{ top: 370, zIndex: 150 }}>
            <div className="px-5 py-2 rounded-full font-bold text-sm tracking-wide shadow-xl"
              style={{
                background: 'rgba(20,8,45,0.92)',
                border: '1px solid rgba(167,139,250,0.6)',
                color: '#c4b5fd',
                boxShadow: '0 0 24px rgba(139,92,246,0.45)',
                animation: 'fadeInOut 2.8s ease forwards',
              }}>
              {firstActFlash}
            </div>
          </div>
        )}

        {/* ── DEAL CARD ANIMATION OVERLAY ── */}
        {flyCards.map(c => (
          <div key={c.id} style={{
            position: 'absolute',
            left: c.fromX - 18,
            top: c.fromY - 25,
            width: 36,
            height: 50,
            zIndex: 200,
            pointerEvents: 'none',
            animationName: 'flyCard',
            animationDuration: '480ms',
            animationDelay: `${c.delay}ms`,
            animationFillMode: 'both',
            animationTimingFunction: 'cubic-bezier(0.22,0.61,0.36,1)',
            '--tx': `${c.toX - c.fromX}px`,
            '--ty': `${c.toY - c.fromY}px`,
          } as React.CSSProperties & Record<string, string>}
            className="vp-card-back rounded-md border border-white/40 shadow-2xl shadow-black/90"
          />
        ))}

        {/* ── CHIP-TO-POT ANIMATION OVERLAY ── */}
        {flyChips.map(c => (
          <div key={c.id} style={{
            position: 'absolute',
            left: c.fromX - 10,
            top: c.fromY - 10,
            width: 20,
            height: 20,
            zIndex: 200,
            pointerEvents: 'none',
            animationName: 'flyChip',
            animationDuration: '680ms',
            animationFillMode: 'both',
            animationTimingFunction: 'cubic-bezier(0.22,0.61,0.36,1)',
            '--cx': `${c.toX - c.fromX}px`,
            '--cy': `${c.toY - c.fromY}px`,
          } as React.CSSProperties & Record<string, string>}
            className="chip chip-gold"
          />
        ))}

        {/* ── TIP CHIP-TO-DEALER ANIMATION OVERLAY ── */}
        {flyTipChips.map((c, idx) => (
          <div key={c.id} style={{
            position: 'absolute',
            left: c.fromX - 11,
            top: c.fromY - 11,
            width: 22,
            height: 22,
            zIndex: 210,
            pointerEvents: 'none',
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, #ffe066, #f5a623 55%, #b8740a)`,
            border: '2px solid rgba(255,220,80,0.9)',
            boxShadow: '0 0 8px rgba(255,200,50,0.7), 0 2px 4px rgba(0,0,0,0.6)',
            animationName: 'flyTipChip',
            animationDuration: `${700 + idx * 55}ms`,
            animationFillMode: 'both',
            animationTimingFunction: 'cubic-bezier(0.18,0.65,0.38,1)',
            '--tx': `${c.toX - c.fromX}px`,
            '--ty': `${c.toY - c.fromY}px`,
          } as React.CSSProperties & Record<string, string>}
          />
        ))}

        {/* ── TOP HUD ── */}
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2.5" style={{ background: 'linear-gradient(to bottom, rgba(5,26,15,0.95), transparent)' }}>
          <button onClick={() => setMenuOpen(v => !v)} className="w-8 h-8 flex flex-col justify-center gap-1.5">
            {[0,1,2].map(i => <div key={i} className="h-0.5 bg-white/60 rounded-full" style={{ width: i === 1 ? 14 : 18 }} />)}
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-2 py-1 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ animation: 'pulse-glow 1.5s infinite' }} />
              <span className="text-red-400 text-[10px] font-bold tracking-wider uppercase">LIVE</span>
            </div>
            <div className="text-white/50 font-mono text-xs bg-black/40 px-2 py-1 rounded-lg border border-white/10">
              #{table.code}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-amber-500/15 border border-amber-500/20 rounded-lg px-2 py-1 flex items-center gap-1">
              <span className="text-amber-400 text-[10px]">🪙</span>
              <span className="text-amber-300 font-mono text-[11px] font-bold">{mySeat ? mySeat.chips.toLocaleString() : (user.chips || 0).toLocaleString()}</span>
            </div>
            {/* Voice controls */}
            {voice.inVoice ? (
              <>
                <button onClick={voice.toggleSpeaker} title={voice.speakerOn ? 'Mute speaker' : 'Unmute speaker'}
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${voice.speakerOn ? 'bg-red-800/40 text-red-300' : 'bg-red-900/50 text-red-400'}`}>
                  {voice.speakerOn ? '🔊' : '🔇'}
                </button>
                <button onClick={voice.toggleMic} title={voice.micOn ? 'Mute mic' : 'Unmute mic'}
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${voice.micOn ? 'bg-red-800/40 text-red-300' : 'bg-red-900/50 text-red-400'}`}>
                  {voice.micOn ? '🎤' : '🎙️'}
                </button>
                <button onClick={voice.leaveVoice} title="Leave voice"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-red-900/50 text-red-400 text-sm">
                  📵
                </button>
              </>
            ) : (
              <button onClick={voice.joinVoice} title="Join voice chat"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-red-900/40 hover:text-red-300 text-sm transition-colors">
                🎤
              </button>
            )}
            <button onClick={() => setChatOpen(v => !v)} className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white relative">
              💬
              {table.chat.length > 0 && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-600 rounded-full" />}
            </button>
          </div>
        </div>

        {/* ── TIP FLASH BANNER (visible to all players) ── */}
        {tipFlash && (
          <div
            key={`${tipFlash.name}-${tipFlash.amount}`}
            className="absolute pointer-events-none"
            style={{
              top: 152,
              left: '50%',
              zIndex: 220,
              animation: 'tipFlashAnim 3.4s ease forwards',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg, rgba(30,15,0,0.96), rgba(20,10,0,0.96))',
              border: '1px solid rgba(255,190,40,0.75)',
              borderRadius: 24,
              padding: '6px 14px',
              boxShadow: '0 0 18px rgba(255,165,0,0.5), 0 4px 14px rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {/* Coin stack icon */}
              <span style={{ fontSize: 15, lineHeight: 1 }}>🪙</span>
              <span style={{ color: '#fde68a', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em' }}>
                {tipFlash.name}
              </span>
              <span style={{ color: 'rgba(255,220,120,0.65)', fontSize: 10 }}>tipped dealer</span>
              <span style={{
                background: 'linear-gradient(90deg, #f5a623, #ffde6b)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: 12,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}>₹{tipFlash.amount}</span>
              <span style={{ fontSize: 13, lineHeight: 1 }}>💸</span>
            </div>
          </div>
        )}

        {/* ── DEALER AREA ── */}
        <div className="absolute left-0 right-0 vp-dealer-halo" style={{ top: 44, height: 165, zIndex: 5 }}>
          {/* Dealer figure */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 12 }}>
            {/* Head */}
            <div className="w-12 h-12 rounded-full mx-auto mb-0" style={{ background: 'radial-gradient(circle at 40% 35%, #f5deb3, #c8a96e)', border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.6)' }}>
              {/* Eyes */}
              <div className="flex justify-center gap-3 pt-3">
                <div className="w-2 h-2 rounded-full bg-[#1a0f00]" />
                <div className="w-2 h-2 rounded-full bg-[#1a0f00]" />
              </div>
              {/* Visor */}
              <div className="mx-auto mt-0.5" style={{ width: 30, height: 10, background: 'linear-gradient(to bottom, #1a3a1a, #0d2010)', borderRadius: '4px 4px 0 0', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            {/* Body */}
            <div className="vp-waistcoat relative mt-[-2px] mx-auto rounded-t-lg overflow-hidden" style={{ width: 52, height: 44, border: '1px solid rgba(255,255,255,0.08)' }}>
              {/* Bow tie */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                <div className="w-2 h-1.5 bg-amber-600 rounded-sm" style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }} />
                <div className="w-1.5 h-2 bg-amber-700 rounded-sm" />
                <div className="w-2 h-1.5 bg-amber-600 rounded-sm" style={{ clipPath: 'polygon(100% 0, 0 50%, 100% 100%)' }} />
              </div>
            </div>
          </div>
          {/* LIVE DEALER badge */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 124 }}>
            <div className="flex items-center gap-1.5 bg-black/70 border border-amber-600/40 rounded-full px-3 py-1 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-amber-400 font-bold text-[9px] tracking-[0.2em] uppercase">DEALER</span>
              {dealerName && <span className="text-white/50 text-[9px]">· {dealerName}</span>}
            </div>
          </div>
        </div>

        {/* ── TIP DEALER ── */}
        {mySeat && (
          <div className="absolute flex flex-col items-center z-20" style={{ top: 132, left: '50%', transform: 'translateX(-50%)', gap: 4 }}>
            {!tipOpen ? (
              <button onClick={() => { setTipOpen(true); setTipAmount(''); }}
                className="bg-yellow-900/60 hover:bg-yellow-800/70 border border-yellow-600/40 text-yellow-300 text-[10px] font-bold px-3 py-1 rounded-full transition-colors shadow backdrop-blur-sm whitespace-nowrap">
                💸 Tip Dealer
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2 bg-black/85 border border-yellow-700/40 rounded-2xl px-3 py-2.5 shadow-xl backdrop-blur-sm" style={{ minWidth: 170 }}>
                <div className="flex items-center justify-between w-full">
                  <span className="text-yellow-300/70 text-[9px] font-bold uppercase tracking-wider">Tip {dealerPersonName}</span>
                  <button onClick={() => setTipOpen(false)} className="text-white/30 hover:text-white/60 text-xs leading-none">✕</button>
                </div>
                <div className="flex gap-2 w-full">
                  <div className="flex items-center bg-black/60 border border-yellow-700/40 rounded-full px-2 flex-1">
                    <span className="text-yellow-500 text-[11px] font-bold mr-0.5">₹</span>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={tipAmount}
                      onChange={e => setTipAmount(e.target.value)}
                      placeholder="Amount"
                      className="bg-transparent text-yellow-100 text-[11px] w-full outline-none py-1 placeholder-yellow-700/60"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const n = parseInt(tipAmount);
                          if (n >= 1 && n <= 10000 && n <= mySeat.chips) { doTip(n); setTipOpen(false); }
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      const n = parseInt(tipAmount);
                      if (n >= 1 && n <= 10000 && n <= mySeat.chips) { doTip(n); setTipOpen(false); }
                    }}
                    disabled={busy || (() => { const n = parseInt(tipAmount); return !(n >= 1 && n <= 10000 && n <= mySeat.chips); })()}
                    className="bg-yellow-700/80 hover:bg-yellow-600/90 border border-yellow-500/50 text-yellow-100 text-[10px] font-bold px-3 py-1 rounded-full transition-colors disabled:opacity-40 whitespace-nowrap">
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TABLE OVAL ── */}
        <div className="absolute vp-wood-texture rounded-[140px]" style={{ top: 192, left: 18, width: 354, height: 456, zIndex: 6 }}>
          {/* Felt surface */}
          <div className="absolute vp-felt-texture vp-felt-pattern rounded-[122px]" style={{ inset: 16 }}>
            {/* Vignette */}
            <div className="absolute inset-0 rounded-[108px] vp-felt-vignette" />
            {/* Gold border ring */}
            <div className="absolute inset-0 rounded-[108px]" style={{ boxShadow: 'inset 0 0 0 2px rgba(212,160,23,0.35), inset 0 0 30px rgba(0,0,0,0.5)' }} />

            {/* ── POT DISPLAY ── */}
            <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 162 }}>
              {pot > 0 ? (
                <div className="pot-pill px-4 py-1.5 rounded-full flex items-center gap-2">
                  <div className="chip chip-gold w-4 h-4" />
                  <span className="text-amber-300 font-mono font-bold text-sm">₹{pot.toLocaleString()}</span>
                  <span className="text-white/30 text-[9px] uppercase tracking-wider">POT</span>
                </div>
              ) : (
                <div className="pot-pill px-3 py-1 rounded-full">
                  <span className="text-white/30 text-xs font-semibold">Boot ₹{table.boot}</span>
                </div>
              )}
            </div>

            {/* Sideshow result flash */}
            {table.sideshowResult && !sideshowResultDismissed && (Date.now() - (table.sideshowResult.at || 0)) < 2000 && (() => {
              const sr = table.sideshowResult;
              if (!sr.targetAccepted) {
                // Declined — just show who declined
                const decliner = table.seats[sr.targetSeat];
                return (
                  <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 195, zIndex: 30 }}>
                    <div className="bg-black/85 border border-white/20 rounded-xl px-3 py-1.5 text-center backdrop-blur-sm"
                      style={{ boxShadow: '0 0 14px rgba(0,0,0,0.6)' }}>
                      <div className="flex items-center gap-2">
                        <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">
                          ⇌ Sideshow Declined
                        </div>
                        <button onClick={() => setSideshowResultDismissed(true)} className="text-white/30 hover:text-white/60 text-xs leading-none">×</button>
                      </div>
                      {decliner && (
                        <div className="text-white/35 text-[9px] mt-0.5">{decliner.username} refused</div>
                      )}
                    </div>
                  </div>
                );
              }
              // Accepted — show winner stays / loser packs
              const loserSeat: number = sr.loserSeat;
              const winnerSeat: number = loserSeat === sr.requesterSeat ? sr.targetSeat : sr.requesterSeat;
              const winner = table.seats[winnerSeat];
              const loser  = table.seats[loserSeat];
              const winnerIsMe = winnerSeat === myIdx;
              const loserIsMe  = loserSeat  === myIdx;
              return (
                <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 190, zIndex: 30 }}>
                  <div className="flex flex-col items-center gap-1 bg-black/88 border border-violet-500/40 rounded-2xl px-4 py-2 text-center backdrop-blur-sm"
                    style={{ boxShadow: '0 0 20px rgba(139,92,246,0.3)', minWidth: 150 }}>
                    {/* Header with dismiss */}
                    <div className="flex items-center gap-2 w-full justify-between">
                      <div className="text-violet-300 text-[9px] font-bold uppercase tracking-[0.18em]">⇌ Sideshow</div>
                      <button onClick={() => setSideshowResultDismissed(true)} className="text-white/30 hover:text-white/60 text-xs leading-none">×</button>
                    </div>
                    {/* Winner row */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] leading-none">✅</span>
                      <span className="text-green-300 font-bold text-[11px]">
                        {winnerIsMe ? 'You' : winner?.username ?? '—'}
                      </span>
                      <span className="text-white/40 text-[10px]">stays</span>
                    </div>
                    {/* Loser row */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] leading-none">❌</span>
                      <span className="text-red-400 font-bold text-[11px]">
                        {loserIsMe ? 'You' : loser?.username ?? '—'}
                      </span>
                      <span className="text-white/40 text-[10px]">packs</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Opponent seats */}
            {opponents.slice(0, 5).map(({ s, idx }: any, posIdx: number) => {
              const pos = SEAT_POSITIONS[posIdx] || SEAT_POSITIONS[0];
              return (
                <VegasSeat key={idx} seat={{ ...s, seat: idx }} posStyle={pos} isLeft={pos.isLeft} table={table} myUserId={user.id} firstActSeat={firstActSeat}
                  isSpeaking={voice.speakingPeerIds.includes(s.userId)} isInVoice={voice.voicePeerIds.includes(s.userId)} />
              );
            })}

            {/* Winner banner overlay */}
            {table.status === 'showdown' && table.winnerIdx >= 0 && (
              <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 18, zIndex: 30 }}>
                <div className="winner-banner px-4 py-1.5 rounded-full text-center" style={{ animation: 'winner-pulse 1.5s ease-in-out infinite' }}>
                  <span className="text-amber-100 font-bold text-xs tracking-wider uppercase">
                    🏆 {table.seats[table.winnerIdx]?.username} wins ₹{pot}!
                  </span>
                </div>
              </div>
            )}

            {/* Lobby status */}
            {table.status === 'lobby' && (
              <div className="absolute inset-x-0 flex flex-col items-center justify-center" style={{ top: 210, gap: 8 }}>
                <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">{totalOccupied}/{table.maxPlayers} players</div>
                {table.hostId === user.id && totalOccupied >= 2 && (
                  <button onClick={doStart} disabled={busy} className="bg-gradient-to-r from-amber-600 to-amber-500 text-black font-bold px-6 py-2 rounded-full text-sm shadow-lg shadow-amber-900/50 disabled:opacity-50 transition-all">
                    DEAL CARDS
                  </button>
                )}

              </div>
            )}

            {/* Showdown start new hand */}
            {table.status === 'showdown' && table.hostId === user.id && (
              <div className="absolute inset-x-0 flex justify-center" style={{ top: 215, zIndex: 30 }}>
                <button onClick={doStart} disabled={busy} className="bg-gradient-to-r from-green-800 to-green-700 text-white font-bold px-6 py-2 rounded-full text-sm shadow-lg disabled:opacity-50 transition-all">
                  Next Hand →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── MY SEAT ── */}
        {mySeat && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1" style={{ top: 596, zIndex: 20 }}>
            {/* My cards */}
            <div className="flex gap-2">
              {mySeat.inHand && mySeat.cards ? (
                mySeat.cards.map((c: any, i: number) => (
                  <div key={i} className="deal-in" style={{ '--delay': `${i * 0.08}s` } as any}>
                    <PlayingCard card={c} glow={table.winnerIdx === myIdx} />
                  </div>
                ))
              ) : mySeat.inHand && !mySeat.folded ? (
                [0, 1, 2].map(i => <CardBack key={i} />)
              ) : null}
            </div>
            {/* My avatar + label */}
            <div className="flex flex-col items-center mt-0.5">
              {/* Avatar circle */}
              {(() => {
                const myAvatarSrc = mySeat.avatarUrl || userAvatar || null;
                const isWinnerMe = table.winnerIdx === myIdx;
                return (
                  <div
                    className={`w-[52px] h-[52px] rounded-full overflow-hidden border-[2.5px] shadow-lg mb-1 flex items-center justify-center text-lg font-bold`}
                    style={{
                      borderColor: isWinnerMe ? '#F59E0B' : 'rgba(255,255,255,0.2)',
                      boxShadow: isWinnerMe ? '0 0 12px rgba(245,158,11,0.5)' : undefined,
                      background: `linear-gradient(135deg, hsl(${(mySeat.username.charCodeAt(0) * 40) % 360}, 50%, 35%), hsl(${(mySeat.username.charCodeAt(0) * 40 + 40) % 360}, 60%, 20%))`,
                    }}
                  >
                    {myAvatarSrc
                      ? <img src={myAvatarSrc} alt="you" className="w-full h-full object-cover" />
                      : <span className="text-white/80">{mySeat.username.slice(0, 2).toUpperCase()}</span>}
                  </div>
                );
              })()}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${mySeat.folded ? 'border-red-800/40 bg-red-950/50' : 'border-red-800/50 bg-red-950/60'}`}>
                <div className={`w-2 h-2 rounded-full ${mySeat.folded ? 'bg-red-500' : 'bg-red-500'}`} />
                <span className="text-white font-bold text-[11px] uppercase tracking-wider">YOU</span>
                {mySeat.inHand && <span className={`text-[9px] font-bold ${mySeat.seen ? 'text-blue-400' : 'text-red-400'}`}>{mySeat.folded ? 'PACKED' : mySeat.seen ? 'SEEN' : 'BLIND'}</span>}
              </div>
              {mySeat.chipsInPot > 0 && (
                <span className="text-amber-300/60 font-mono text-[9px] mt-0.5">+₹{mySeat.chipsInPot} in pot</span>
              )}
              {table.handLabel && table.winnerIdx === myIdx && (
                <div className="text-amber-300 text-[9px] font-bold uppercase">{table.seats[myIdx]?.handLabel}</div>
              )}
            </div>
          </div>
        )}

        {/* ── ACTION BAR ── */}
        <div className="absolute bottom-0 left-0 right-0 z-30" style={{ height: 190, background: 'linear-gradient(to top, rgba(4,12,8,0.98) 0%, rgba(4,12,8,0.92) 70%, transparent 100%)', paddingTop: 20 }}>
          {/* Timer bar */}
          {isMyTurn && timerSec !== null && (
            <div className="absolute top-3 left-8 right-8 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${(timerSec / 15) * 100}%`,
                  background: timerSec < 5 ? '#ef4444' : timerSec < 10 ? '#f59e0b' : '#22c55e',
                }} />
            </div>
          )}

          <div className="px-4 pt-6">
            {/* Sideshow target */}
            {iAmSideshowTarget && (
              <div className="flex gap-3 mb-2">
                <div className="flex-1 text-center">
                  <div className="text-white/50 text-xs mb-2">Sideshow request from {table.seats[table.pendingSideshow.requesterSeat]?.username}</div>
                  <div className="flex gap-2">
                    <button onClick={() => doSideshow(true)} disabled={busy} className="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b)' }}>ACCEPT</button>
                    <button onClick={() => doSideshow(false)} disabled={busy} className="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b)' }}>DECLINE</button>
                  </div>
                </div>
              </div>
            )}

            {/* See cards button */}
            {isMyTurn && mySeat && !mySeat.seen && !iAmSideshowTarget && (
              <div className="mb-3 flex justify-center">
                <button onClick={doSeeCards} disabled={busy} className="flex items-center gap-2 border border-amber-500/40 text-amber-400 hover:text-amber-300 font-semibold text-xs px-4 py-2 rounded-full transition-colors backdrop-blur-sm bg-amber-900/20 disabled:opacity-50">
                  👁 See Cards
                </button>
              </div>
            )}

            {/* Main action buttons */}
            {isMyTurn && mySeat && !iAmSideshowTarget && (
              <div className="grid gap-2" style={{ gridTemplateColumns: canSideshow && activeCount === 2 ? 'repeat(3,1fr)' : canSideshow ? 'repeat(4,1fr)' : activeCount === 2 && mySeat.seen ? 'repeat(4,1fr)' : 'repeat(3,1fr)' }}>
                {/* FOLD */}
                <button onClick={() => doAction('pack')} disabled={busy} className="py-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-0.5 transition-all disabled:opacity-50 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #1c0000, #7f1d1d)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span className="text-red-300 text-sm">✕</span>
                  <span className="text-red-300">FOLD</span>
                </button>
                {/* CHAAL */}
                <button onClick={() => doAction('chaal')} disabled={busy || (mySeat.chips < (mySeat.seen ? seenCost : blindCost))} className="py-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-0.5 transition-all disabled:opacity-50 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #14532d, #15803d)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <span className="text-green-300 text-sm">▶</span>
                  <span className="text-green-300">CHAAL</span>
                  <span className="text-green-400/70 font-mono text-[9px]">₹{mySeat.seen ? seenCost : blindCost}</span>
                </button>
                {/* RAISE */}
                <button onClick={() => doAction('double')} disabled={busy || (mySeat.chips < (mySeat.seen ? seenRaiseCost : blindRaiseCost))} className="py-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-0.5 transition-all disabled:opacity-50 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #451a03, #b45309)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <span className="text-amber-300 text-sm">⬆</span>
                  <span className="text-amber-300">RAISE</span>
                  <span className="text-amber-400/70 font-mono text-[9px]">₹{mySeat.seen ? seenRaiseCost : blindRaiseCost}</span>
                </button>
                {/* SHOW (2 players) */}
                {activeCount === 2 && mySeat.seen && (
                  <button onClick={() => doAction('show')} disabled={busy || mySeat.chips < showCost} className="py-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-0.5 transition-all disabled:opacity-50 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #0c4a6e, #0284c7)', border: '1px solid rgba(56,189,248,0.3)' }}>
                    <span className="text-sky-300 text-sm">★</span>
                    <span className="text-sky-300">SHOW</span>
                    <span className="text-sky-400/70 font-mono text-[9px]">₹{showCost}</span>
                  </button>
                )}
                {/* SIDESHOW */}
                {canSideshow && (
                  <button onClick={() => doAction('sideshow')} disabled={busy} className="py-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-0.5 transition-all disabled:opacity-50 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #2e1065, #7c3aed)', border: '1px solid rgba(167,139,250,0.3)' }}>
                    <span className="text-violet-300 text-sm">⇌</span>
                    <span className="text-violet-300">SIDE</span>
                    <span className="text-violet-400/70 font-mono text-[9px]">₹{seenCost}</span>
                  </button>
                )}
              </div>
            )}

            {/* Waiting / other states */}
            {!isMyTurn && !iAmSideshowTarget && table.status === 'in_hand' && mySeat && !mySeat.folded && (
              <div className="text-center">
                {table.turnIdx >= 0 && table.seats[table.turnIdx] && (
                  <p className="text-white/40 text-xs">Waiting for {table.seats[table.turnIdx].username}…</p>
                )}
                {!mySeat.seen && (
                  <button onClick={doSeeCards} disabled={busy} className="mt-2 text-amber-400/70 text-xs underline hover:text-amber-400 transition-colors disabled:opacity-50">
                    👁 See Cards
                  </button>
                )}
              </div>
            )}
            {mySeat?.folded && <p className="text-center text-red-400/60 text-xs">You packed. Watching…</p>}
            {table.status === 'lobby' && !mySeat && <p className="text-center text-white/30 text-xs">Joining…</p>}
            {table.status === 'showdown' && table.hostId !== user.id && <p className="text-center text-white/30 text-xs">Waiting for host to deal…</p>}
          </div>
        </div>

        {/* ── SIDESHOW CARD REVEAL ── */}
        {iAmInSideshowReveal && !sideshowRevealDismissed && (() => {
          const [seatA, seatB] = sideshowRevealSeats!;
          const seA = table.seats[seatA];
          const seB = table.seats[seatB];
          const loser: number | undefined = table.sideshowResult?.loserSeat;
          return (
            <div className="absolute inset-0 z-50 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
              <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-3xl"
                style={{ background: 'rgba(20,8,45,0.95)', border: '1px solid rgba(167,139,250,0.4)', boxShadow: '0 0 50px rgba(139,92,246,0.35)' }}>
                {/* Header with close button */}
                <div className="flex items-center justify-between w-full">
                  <div className="font-display text-violet-300 font-bold text-base tracking-widest uppercase">⇌ Sideshow</div>
                  <button
                    onClick={() => setSideshowRevealDismissed(true)}
                    className="ml-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/60 hover:text-white transition-all text-base leading-none"
                  >×</button>
                </div>
                <div className="flex gap-6 items-start">
                  {([seatA, seatB] as number[]).map((si) => {
                    const seat = table.seats[si];
                    if (!seat) return null;
                    const isLoser = loser === si;
                    const isMe = si === myIdx;
                    return (
                      <div key={si} className="flex flex-col items-center gap-2">
                        <div className={`text-xs font-bold uppercase tracking-wider ${isMe ? 'text-red-400' : 'text-white/60'}`}>
                          {isMe ? 'YOU' : seat.username}
                        </div>
                        <div className={`flex gap-1 ${isLoser ? 'opacity-40' : ''}`}>
                          {seat.cards
                            ? seat.cards.map((c: any, j: number) => <PlayingCard key={j} card={c} />)
                            : [0, 1, 2].map(j => <CardBack key={j} />)
                          }
                        </div>
                        <div className={`text-[11px] font-bold uppercase tracking-wide ${isLoser ? 'text-red-400' : 'text-green-400'}`}>
                          {isLoser ? '✕ Packs' : '✓ Stays'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {table.sideshowResult?.reqLabel && (
                  <div className="text-white/30 text-[10px] text-center">
                    {seA?.username}: <span className="text-violet-300">{table.sideshowResult.reqLabel}</span>
                    {' vs '}
                    {seB?.username}: <span className="text-violet-300">{table.sideshowResult.tarLabel}</span>
                  </div>
                )}
                {/* Dismiss button */}
                <button
                  onClick={() => setSideshowRevealDismissed(true)}
                  className="mt-1 px-6 py-2 rounded-2xl font-bold text-sm text-white/80 hover:text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
                >Got it</button>
              </div>
            </div>
          );
        })()}

        {/* ── CHAT DRAWER ── */}
        {chatOpen && (
          <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col" style={{ height: 360, background: 'rgba(5,20,12,0.97)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-white font-semibold text-sm">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-white/50 text-lg">×</button>
            </div>
            <div className="flex-1 overflow-y-auto thin-scroll px-4 py-2 space-y-2">
              {table.chat.length === 0 && <p className="text-white/20 text-xs text-center py-4">No messages yet</p>}
              {table.chat.map((m: any) => (
                <div key={m.id} className={`flex gap-2 ${m.userId === user.id ? 'flex-row-reverse' : ''}`}>
                  <div className={`max-w-[70%] px-3 py-1.5 rounded-xl text-sm ${m.userId === user.id ? 'bg-red-900/60 text-red-100' : 'bg-white/5 text-white/80'}`}>
                    {m.userId !== user.id && <div className="text-[10px] text-white/40 mb-0.5">{m.username}</div>}
                    {m.message}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="flex gap-2 px-4 py-3 border-t border-white/10">
              <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Say something…"
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-red-500/50" />
              <button type="submit" className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">Send</button>
            </form>
          </div>
        )}

        {/* ── MENU DRAWER ── */}
        {menuOpen && (
          <div className="absolute top-0 left-0 bottom-0 w-3/4 z-50 flex flex-col" style={{ background: 'rgba(5,15,10,0.97)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <span className="font-display text-amber-400 font-bold">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="text-white/50 text-xl">×</button>
            </div>
            <div className="flex-1 p-4 space-y-2">
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-white font-semibold">{user.username}</div>
                <div className="text-amber-400 font-mono text-sm">₹{(mySeat ? mySeat.chips : user.chips).toLocaleString()}</div>
              </div>
              <div className="text-white/40 text-xs px-1 mt-3">Table Info</div>
              <div className="bg-white/5 rounded-xl px-3 py-2 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-white/50">Code</span><span className="text-white font-mono">{table.code}</span></div>
                <div className="flex justify-between text-sm"><span className="text-white/50">Boot</span><span className="text-white">₹{table.boot}</span></div>
                <div className="flex justify-between text-sm"><span className="text-white/50">Players</span><span className="text-white">{totalOccupied}/{table.maxPlayers}</span></div>
              </div>

              <button onClick={() => { setShowStats(true); setMenuOpen(false); }} className="w-full bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-xl text-sm transition-colors">📊 My Stats</button>
              <button onClick={doLeave} className="w-full bg-red-950/50 hover:bg-red-900/50 text-red-400 py-2 rounded-xl text-sm font-semibold transition-colors mt-4">
                Leave Table
              </button>
            </div>
          </div>
        )}
        {menuOpen && <div className="absolute inset-0 z-40" style={{ backdropFilter: 'blur(2px)' }} onClick={() => setMenuOpen(false)} />}

        {/* Stats overlay */}
        {showStats && <StatsView user={user} token={token} onClose={() => setShowStats(false)} />}
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
type AdminTab = 'dashboard' | 'users' | 'tables' | 'logs';

function AdminPanel() {
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('tp_admin_token'));
  const [admin, setAdmin] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('tp_admin') || 'null'); } catch { return null; } });
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<AdminTab>('dashboard');

  // Dashboard
  const [stats, setStats] = useState<any>(null);
  // Users
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState<'set' | 'delta'>('set');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [txnMap, setTxnMap] = useState<Record<string, any[]>>({});
  // Tables
  const [tables, setTables] = useState<any[]>([]);
  // Logs
  const [logs, setLogs] = useState<any[]>([]);

  const adminApi = useCallback(async (method: string, path: string, body?: any) => {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed');
    return data;
  }, [adminToken]);

  // Load data for current tab
  useEffect(() => {
    if (!adminToken) return;
    if (tab === 'dashboard') adminApi('GET', '/admin/stats').then(setStats).catch(() => {});
    if (tab === 'users') adminApi('GET', `/admin/users${userSearch ? `?q=${userSearch}` : ''}`).then(d => setUsers(d.users || [])).catch(() => {});
    if (tab === 'tables') adminApi('GET', '/admin/tables').then(d => setTables(d.tables || [])).catch(() => {});
    if (tab === 'logs') adminApi('GET', '/admin/logs').then(d => setLogs(d.logs || [])).catch(() => {});
  }, [adminToken, tab, adminApi]);

  // Re-search users when search term changes
  useEffect(() => {
    if (!adminToken || tab !== 'users') return;
    const t = setTimeout(() => {
      adminApi('GET', `/admin/users${userSearch ? `?q=${encodeURIComponent(userSearch)}` : ''}`).then(d => setUsers(d.users || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, adminToken, tab, adminApi]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const d = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await d.json();
      if (!d.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('tp_admin_token', data.token);
      localStorage.setItem('tp_admin', JSON.stringify(data.admin));
      setAdminToken(data.token); setAdmin(data.admin);
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  async function doAdjust(u: any) {
    setBusy(true);
    try {
      const chips = Number(adjustAmount);
      if (isNaN(chips)) { toast.error('Invalid amount'); setBusy(false); return; }
      if (adjustMode === 'set') {
        const delta = chips - u.chips;
        if (delta === 0) { toast.error('No change'); setBusy(false); return; }
        await adminApi('POST', `/admin/users/${u.id}/adjust`, { amount: delta, note: adjustNote || 'Admin adjustment' });
      } else {
        if (chips === 0) { toast.error('Amount cannot be zero'); setBusy(false); return; }
        await adminApi('POST', `/admin/users/${u.id}/adjust`, { amount: chips, note: adjustNote || 'Admin adjustment' });
      }
      toast.success('Chips updated');
      const d = await adminApi('GET', '/admin/users');
      setUsers(d.users || []);
      setExpandedUser(null); setAdjustAmount(''); setAdjustNote('');
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  async function doReset(u: any) {
    if (!confirm(`Reset ${u.username}'s chips to ₹5,000?`)) return;
    setBusy(true);
    try {
      await adminApi('POST', `/admin/users/${u.id}/reset`, {});
      toast.success(`${u.username} reset to ₹5,000`);
      const d = await adminApi('GET', '/admin/users');
      setUsers(d.users || []);
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  async function loadTxns(userId: string) {
    if (txnMap[userId]) return;
    try {
      const d = await adminApi('GET', `/admin/users/${userId}/txns`);
      setTxnMap(prev => ({ ...prev, [userId]: d.transactions || [] }));
    } catch { /* ignore */ }
  }

  function logout() {
    localStorage.removeItem('tp_admin_token'); localStorage.removeItem('tp_admin');
    setAdminToken(null); setAdmin(null); setStats(null); setUsers([]); setTables([]); setLogs([]);
  }

  if (!adminToken || !admin) {
    return (
      <div className="min-h-screen casino-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🛡️</div>
            <h1 className="font-display font-bold text-amber-400 text-2xl tracking-wider">ADMIN PANEL</h1>
            <p className="text-white/40 text-sm mt-1">Teen Patti Risk Lab</p>
          </div>
          <form onSubmit={login} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-white/50 text-xs mb-1.5 block uppercase tracking-wider">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/50 text-xs mb-1.5 block uppercase tracking-wider">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
            </div>
            <button disabled={busy} className="w-full bg-gradient-to-r from-amber-600 to-amber-400 text-black font-bold py-3 rounded-xl disabled:opacity-50 transition-all">
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-white/30 text-xs mt-4">Default: admin / admin1234</p>
        </div>
      </div>
    );
  }

  const TABS: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'tables', label: 'Tables', icon: '🎰' },
    { id: 'logs', label: 'Logs', icon: '📋' },
  ];

  return (
    <div className="min-h-screen casino-bg" style={{ fontFamily: "'Source Sans 3', sans-serif" }}>
      {/* Header */}
      <div className="bg-black/70 border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <div className="font-bold text-amber-400 text-sm tracking-widest uppercase">Admin Panel</div>
            <div className="text-white/40 text-xs">Logged in as <span className="text-white/60">{admin.username}</span></div>
          </div>
        </div>
        <button onClick={logout} className="text-red-400 hover:text-red-300 text-xs font-semibold border border-red-900/50 hover:border-red-700/50 px-3 py-1.5 rounded-lg transition-colors">
          Logout
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {tab === 'dashboard' && (
        <div className="p-4 space-y-4">
          {!stats ? (
            <div className="text-white/30 text-center py-16">Loading…</div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Users', val: stats.totalUsers?.toLocaleString() ?? '—', icon: '👤', cls: 'text-sky-400' },
                  { label: 'Chips in Play', val: `₹${(stats.totalChips || 0).toLocaleString()}`, icon: '🪙', cls: 'text-amber-400' },
                  { label: 'Hands Played', val: stats.totalHands?.toLocaleString() ?? '—', icon: '🃏', cls: 'text-red-400' },
                  { label: 'Active Tables', val: stats.activeTables ?? '0', icon: '🎰', cls: 'text-purple-400' },
                  { label: 'Total Staked', val: `₹${(stats.totalStaked || 0).toLocaleString()}`, icon: '💰', cls: 'text-rose-400' },
                  { label: 'Avg Loss %', val: `${stats.avgLossPct ?? 0}%`, icon: '📉', cls: 'text-orange-400' },
                  { label: 'Tips Collected', val: `₹${(stats.totalTips || 0).toLocaleString()}`, icon: '💸', cls: 'text-yellow-400' },
                ].map(({ label, val, icon, cls }) => (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{icon}</span>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider leading-tight">{label}</div>
                    </div>
                    <div className={`text-xl font-bold font-mono ${cls}`}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Circulation chart */}
              {stats.circulation?.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white/60 text-xs uppercase tracking-wider">Pot Circulation — Last 14 Days</h3>
                    <span className="text-white/30 text-xs font-mono">₹</span>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={stats.circulation} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="circGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Pot']}
                        labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                      />
                      <Area type="monotone" dataKey="circulation" stroke="#F59E0B" strokeWidth={2} fill="url(#circGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex justify-between mt-1 px-0.5">
                    {stats.circulation.filter((_: any, i: number) => i % 2 === 0).map((d: any) => (
                      <span key={d.date} className="text-white/20 text-[9px]">{d.date}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Hands per day chart */}
              {stats.circulation?.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider mb-3">Hands per Day</h3>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={stats.circulation} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="handsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34D399" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [v, 'Hands']}
                        labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                      />
                      <Area type="monotone" dataKey="hands" stroke="#34D399" strokeWidth={2} fill="url(#handsGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top Winners / Losers */}
              <div className="grid grid-cols-2 gap-3">
                {/* Top Winners */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <h3 className="text-red-400/70 text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                    <span>🏆</span> Top Winners
                  </h3>
                  <div className="space-y-2">
                    {(stats.topWinners || []).map((u: any, i: number) => (
                      <div key={u.id} className="flex items-center gap-2">
                        <span className="text-white/30 text-[10px] w-4">{i + 1}</span>
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white/80 text-xs truncate">{u.username}</div>
                          <div className="text-white/30 text-[9px]">{u.handsPlayed} hands</div>
                        </div>
                        <span className="text-green-400 font-mono text-xs font-bold">+₹{u.netPnL.toLocaleString()}</span>
                      </div>
                    ))}
                    {!(stats.topWinners?.length) && <div className="text-white/20 text-xs">No data yet</div>}
                  </div>
                </div>

                {/* Top Losers */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <h3 className="text-rose-400/70 text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                    <span>📉</span> Top Losers
                  </h3>
                  <div className="space-y-2">
                    {(stats.topLosers || []).map((u: any, i: number) => (
                      <div key={u.id} className="flex items-center gap-2">
                        <span className="text-white/30 text-[10px] w-4">{i + 1}</span>
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-700 to-rose-900 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white/80 text-xs truncate">{u.username}</div>
                          <div className="text-white/30 text-[9px]">{u.handsPlayed} hands</div>
                        </div>
                        <span className="text-rose-400 font-mono text-xs font-bold">₹{u.netPnL.toLocaleString()}</span>
                      </div>
                    ))}
                    {!(stats.topLosers?.length) && <div className="text-white/20 text-xs">No data yet</div>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && (
        <div className="p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
            <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users…"
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-500/50" />
          </div>

          {users.length === 0 && <div className="text-white/30 text-center py-12 text-sm">No users found</div>}

          {users.map(u => {
            const isExpanded = expandedUser === u.id;
            return (
              <div key={u.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                {/* User header row */}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-800 flex items-center justify-center text-black font-bold text-sm shrink-0">
                    {u.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-sm">{u.username}</div>
                    <div className="flex gap-2 mt-0.5 text-[10px]">
                      <span className="text-white/40">{u.handsPlayed ?? 0} hands</span>
                      <span className="text-red-400">{u.wins ?? 0}W</span>
                      <span className="text-rose-400">{u.losses ?? 0}L</span>
                      <span className={u.netPnL >= 0 ? 'text-green-400' : 'text-rose-400'}>
                        {u.netPnL >= 0 ? '+' : ''}₹{(u.netPnL ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-amber-400 font-mono font-bold text-sm">₹{u.chips.toLocaleString()}</div>
                    <button onClick={() => {
                      if (isExpanded) { setExpandedUser(null); return; }
                      setExpandedUser(u.id); setAdjustAmount(String(u.chips)); setAdjustNote(''); setAdjustMode('set');
                      loadTxns(u.id);
                    }} className="text-[10px] text-white/30 hover:text-amber-400 transition-colors mt-0.5">
                      {isExpanded ? '▲ Close' : '▼ Manage'}
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-4 space-y-4 bg-black/20">
                    {/* Chip adjustment */}
                    <div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Chip Adjustment</div>
                      <div className="flex gap-1 mb-2">
                        {(['set', 'delta'] as const).map(m => (
                          <button key={m} onClick={() => { setAdjustMode(m); setAdjustAmount(''); }}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${adjustMode === m ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                            {m === 'set' ? 'Set Balance' : '+/− Delta'}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
                          placeholder={adjustMode === 'set' ? 'New balance' : 'e.g. +500 or -200'}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-500/50" />
                        <button onClick={() => doAdjust(u)} disabled={busy || !adjustAmount}
                          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                          Apply
                        </button>
                      </div>
                      <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="Reason (optional)"
                        className="w-full mt-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-500/50" />
                    </div>

                    {/* Reset chips */}
                    <button onClick={() => doReset(u)} disabled={busy}
                      className="w-full border border-white/10 hover:border-red-700/50 hover:bg-red-900/20 text-white/50 hover:text-red-300 text-xs font-semibold py-2 rounded-xl transition-colors">
                      Reset to ₹5,000 (default)
                    </button>

                    {/* Transaction history */}
                    <div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Recent Transactions</div>
                      {!txnMap[u.id] ? (
                        <div className="text-white/20 text-xs">Loading…</div>
                      ) : txnMap[u.id].length === 0 ? (
                        <div className="text-white/20 text-xs">No transactions</div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {txnMap[u.id].map((tx: any) => (
                            <div key={tx.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                              <div>
                                <div className="text-white/70 text-xs capitalize">{tx.type.replace('_', ' ')}</div>
                                {tx.note && <div className="text-white/30 text-[9px] truncate max-w-[140px]">{tx.note}</div>}
                              </div>
                              <div className="text-right">
                                <div className={`font-mono text-xs font-bold ${tx.amount >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                  {tx.amount >= 0 ? '+' : ''}₹{tx.amount.toLocaleString()}
                                </div>
                                <div className="text-white/25 text-[9px] font-mono">→₹{tx.balanceAfter.toLocaleString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TABLES ── */}
      {tab === 'tables' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-xs">{tables.length} active table{tables.length !== 1 ? 's' : ''}</span>
            <button onClick={() => adminApi('GET', '/admin/tables').then(d => setTables(d.tables || [])).catch(() => {})}
              className="text-amber-400/70 hover:text-amber-400 text-xs transition-colors">↻ Refresh</button>
          </div>
          {tables.length === 0 && <div className="text-white/30 text-center py-16 text-sm">No active tables</div>}
          {tables.map(t => (
            <div key={t.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-white font-semibold text-sm">{t.name}</div>
                  <div className="text-white/40 text-[10px] mt-0.5 font-mono">{t.code}</div>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.status === 'in_hand' ? 'bg-red-900/60 text-red-400' : t.status === 'showdown' ? 'bg-purple-900/60 text-purple-400' : 'bg-white/10 text-white/40'}`}>
                    {t.status}
                  </div>
                  <div className="text-amber-400 font-mono text-xs mt-1">Pot ₹{t.pot}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {t.seats.map((s: any, i: number) => (
                  <div key={i} className={`rounded-xl px-2.5 py-2 text-center ${s ? (s.folded ? 'bg-white/3 opacity-40' : s.inHand ? 'bg-red-900/30 border border-red-700/30' : 'bg-white/5') : 'bg-white/3 border border-dashed border-white/5'}`}>
                    {s ? (
                      <>
                        <div className="text-white/80 text-[10px] font-semibold truncate">{s.username}</div>
                        <div className="text-amber-400 font-mono text-[9px]">₹{s.chips}</div>
                        {s.isBot && <div className="text-white/25 text-[8px]">BOT</div>}
                      </>
                    ) : (
                      <div className="text-white/15 text-[9px]">empty</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-3 text-[10px] text-white/30">
                <span>Boot ₹{t.boot}</span>
                <span>{t.isPublic ? '🌐 Public' : '🔒 Private'}</span>
                <span>{t.seats.filter((s: any) => s).length}/{t.seats.length} players</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LOGS ── */}
      {tab === 'logs' && (
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/40 text-xs">{logs.length} recent actions</span>
            <button onClick={() => adminApi('GET', '/admin/logs').then(d => setLogs(d.logs || [])).catch(() => {})}
              className="text-amber-400/70 hover:text-amber-400 text-xs transition-colors">↻ Refresh</button>
          </div>
          {logs.length === 0 && <div className="text-white/30 text-center py-16 text-sm">No admin actions yet</div>}
          {logs.map(l => (
            <div key={l.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="text-xl shrink-0">{
                l.action === 'admin_login' ? '🔑' :
                l.action === 'chip_adjust' ? '🪙' :
                l.action === 'chip_reset' ? '↺' : '📝'
              }</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-amber-400 text-xs font-semibold">{l.adminUsername}</span>
                  <span className="text-white/40 text-xs capitalize">{l.action.replace(/_/g, ' ')}</span>
                  {l.targetUsername && <span className="text-white/60 text-xs">→ {l.targetUsername}</span>}
                </div>
                {l.details && Object.keys(l.details).length > 0 && (
                  <div className="text-white/30 text-[10px] font-mono mt-0.5 truncate">
                    {JSON.stringify(l.details)}
                  </div>
                )}
                <div className="text-white/20 text-[9px] mt-1">
                  {new Date(l.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Toaster position="top-center" richColors />
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // Route to admin panel if URL path ends with /admin
  if (window.location.pathname.endsWith('/admin')) return <AdminPanel />;

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('tp_token'));
  const [user, setUser] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('tp_user') || 'null'); } catch { return null; } });
  const [chips, setChips] = useState<number>(user?.chips || 0);
  const [table, setTable] = useState<any>(null);
  const [view, setView] = useState<'lobby' | 'friends' | 'stats'>('lobby');
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!token || !user) return;
    const checkNotifs = () => api('GET', '/notifications', undefined, token)
      .then(d => setNotifCount((d.notifications || []).filter((n: any) => n.status === 'pending').length))
      .catch(() => {});
    checkNotifs(); const t = setInterval(checkNotifs, 5000); return () => clearInterval(t);
  }, [token, user]);

  const refreshChips = useCallback(async () => {
    if (!token) return;
    try { const d = await api('GET', '/me', undefined, token); setChips(d.user.chips); setUser((u: any) => ({ ...u, chips: d.user.chips })); } catch { /* ignore */ }
  }, [token]);

  // Keep chip balance fresh while on the main screen
  useEffect(() => {
    if (!token || !user || table) return;
    refreshChips();
    const t = setInterval(refreshChips, 5000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, table]); // intentionally omit user/refreshChips to avoid re-subscribe loop

  function onAuth(tok: string, u: any) {
    localStorage.setItem('tp_token', tok); localStorage.setItem('tp_user', JSON.stringify(u));
    setToken(tok); setUser(u); setChips(u.chips);
  }
  function logout() {
    localStorage.removeItem('tp_token'); localStorage.removeItem('tp_user');
    setToken(null); setUser(null); setTable(null);
  }

  if (!token || !user) return <><AuthView onAuth={onAuth} /><Toaster position="top-center" richColors /></>;
  if (table) return (
    <>
      <VegasTableView tableInit={table} user={user} token={token} userAvatar={localStorage.getItem(`tp_avatar_${user.id}`) || user.avatarUrl || null} onLeave={() => { setTable(null); refreshChips(); }} onRefreshChips={refreshChips} />
      <NotificationsHub user={user} token={token} onJoinTable={(t: any) => setTable(t)} />
      <Toaster position="top-center" richColors />
    </>
  );
  return (
    <>
      {view === 'lobby' && (
        <Lobby user={user} token={token} chipCount={chips}
          onJoinTable={(t: any) => setTable(t)}
          onShowFriends={() => setView('friends')}
          onShowStats={() => setView('stats')}
          onLogout={logout} />
      )}
      {view === 'stats' && <StatsView user={user} token={token} onClose={() => setView('lobby')} />}
      {view === 'friends' && (
        <FriendsView user={user} token={token} notifCount={notifCount}
          onClose={() => setView('lobby')}
          onJoinFriendTable={(t: any) => { setTable(t); setView('lobby'); }} />
      )}
      <NotificationsHub user={user} token={token} onJoinTable={(t: any) => { setTable(t); setView('lobby'); }} />
      <Toaster position="top-center" richColors />
    </>
  );
}
