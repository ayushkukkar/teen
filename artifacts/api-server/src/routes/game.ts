import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@workspace/db';
import { users, transactions, hands, friendships, friendRequests, admins, adminLogs } from '@workspace/db';
import { eq, or, desc, sql, and } from 'drizzle-orm';
import { hashPassword, verifyPassword, signToken, getAuthUser } from '../lib/auth.js';
import { signAdminToken, getAdminAuth, ensureDefaultAdmin, logAdminAction } from '../lib/adminAuth.js';
import {
  createTableState, addPlayer, removePlayer, startHand, playerAction,
  seeCards, computePnL, respondSideshow, checkTurnTimeout, findSeat,
} from '../lib/gameEngine.js';
import { store, getTable, deleteTable, bumpVersion } from '../lib/gameStore.js';
import { decideBot, decideBotSideshow } from '../lib/botAI.js';
import { evaluate } from '../lib/deck.js';
import {
  pushNotification, getNotifications, updateNotification,
  findNotification, removeNotification,
} from '../lib/notifications.js';

const router = Router();
const STARTING_CHIPS = 5000;
const BOT_DELAY_MS = 1200;

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function requireAuth(req: Request, res: Response): Promise<{ user: any } | null> {
  const payload = getAuthUser(req);
  if (!payload) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const [user] = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id)).catch(() => {});
  return { user };
}

const ONLINE_THRESHOLD_MS = 45_000;
function isOnline(user: any): boolean {
  if (!user?.lastActiveAt) return false;
  return (Date.now() - new Date(user.lastActiveAt).getTime()) < ONLINE_THRESHOLD_MS;
}
function findUserCurrentTable(userId: string): any {
  for (const [, state] of store.tables.entries()) {
    if (state.seats.some((s: any) => s && s.userId === userId)) return state;
  }
  return null;
}

function publicTableView(state: any, viewerId: string): any {
  return {
    id: state.id, code: state.code, name: state.name, isPublic: state.isPublic,
    hostId: state.hostId, boot: state.boot, maxPlayers: state.maxPlayers,
    status: state.status, phase: state.phase, pot: state.pot,
    currentStake: state.currentStake, dealerIdx: state.dealerIdx,
    turnIdx: state.turnIdx, winnerIdx: state.winnerIdx,
    showdownReveal: state.showdownReveal, version: state.version,
    updatedAt: state.updatedAt, handId: state.handId,
    handStartedAt: state.handStartedAt || 0,
    turnStartedAt: state.turnStartedAt || 0,
    turnCount: state.turnCount || 0,
    pendingSideshow: state.pendingSideshow || null,
    sideshowResult: state.sideshowResult || null,
    sideshowRevealSeats: (state.sideshowRevealSeats && state.sideshowRevealAt && (Date.now() - state.sideshowRevealAt) < 5000) ? state.sideshowRevealSeats : null,
    log: state.log.slice(-30), chat: state.chat.slice(-50),
    seats: state.seats.map((s: any, idx: number) => {
      if (!s) return null;
      const isMe = s.userId === viewerId;
      const revealAll = state.showdownReveal;
      // Sideshow reveal: both participants can see each other's cards briefly
      const revealSeats: [number, number] | null = state.sideshowRevealSeats ?? null;
      const revealActive = !!(revealSeats && state.sideshowRevealAt && (Date.now() - state.sideshowRevealAt) < 5000);
      const viewerSeat = state.seats.findIndex((x: any) => x && x.userId === viewerId);
      const sideshowReveal = !!(revealActive && revealSeats!.includes(idx) && revealSeats!.includes(viewerSeat) && idx !== viewerSeat);
      const showCards = revealAll || (isMe && s.seen) || sideshowReveal;
      return {
        seat: idx, userId: s.userId, username: s.username, isBot: s.isBot,
        chips: s.chips, seen: s.seen, folded: s.folded, inHand: s.inHand,
        chipsInPot: s.chipsInPot, isBlind: s.isBlind,
        avatarUrl: s.avatarUrl || null,
        cards: showCards && s.cards ? s.cards : null,
        handLabel: revealAll && s.cards && !s.folded ? evaluate(s.cards).label : null,
      };
    }),
  };
}

async function persistHandEnd(state: any): Promise<void> {
  const pnl = computePnL(state);
  for (const p of pnl) {
    if (p.isBot) continue;
    const [user] = await db.select().from(users).where(eq(users.id, p.userId)).limit(1);
    if (!user) continue;
    const newChips = user.chips + p.delta;
    const won = p.delta > 0;
    await db.update(users).set({
      chips: newChips,
      handsPlayed: sql<number>`${users.handsPlayed} + 1`,
      wins: won ? sql<number>`${users.wins} + 1` : users.wins,
      losses: !won ? sql<number>`${users.losses} + 1` : users.losses,
      totalWon: sql<number>`${users.totalWon} + ${p.won}`,
      totalStaked: sql<number>`${users.totalStaked} + ${p.chipsIn}`,
      netPnL: sql<number>`${users.netPnL} + ${p.delta}`,
    }).where(eq(users.id, p.userId));
    if (p.chipsIn > 0) {
      await db.insert(transactions).values({
        id: uuidv4(), userId: p.userId, type: 'stake', amount: -p.chipsIn,
        balanceBefore: user.chips, balanceAfter: user.chips - p.chipsIn,
        tableId: state.id, handId: state.handId, note: 'Staked in hand',
      }).catch(() => {});
    }
    if (p.won > 0) {
      await db.insert(transactions).values({
        id: uuidv4(), userId: p.userId, type: 'win', amount: p.won,
        balanceBefore: user.chips - p.chipsIn, balanceAfter: newChips,
        tableId: state.id, handId: state.handId, note: 'Won pot',
      }).catch(() => {});
    }
  }
  if (state.handId) {
    await db.insert(hands).values({
      id: state.handId, tableId: state.id, pot: state.pot,
      winnerUserId: state.winnerIdx >= 0 ? state.seats[state.winnerIdx]?.userId ?? null : null,
      winnerSeat: state.winnerIdx,
      players: state.seats.filter((s: any) => s && s.chipsInPot > 0).map((s: any) => ({
        userId: s.userId, username: s.username, isBot: s.isBot,
        chipsIn: s.chipsInPot, folded: s.folded,
      })),
      startedAt: new Date(state.handStartedAt || Date.now()),
      endedAt: new Date(),
    }).catch(() => {});
  }
  state._persisted = true;
}

async function advanceBots(state: any): Promise<void> {
  if (!state || state.status !== 'in_hand') return;
  if (checkTurnTimeout(state, 15_000)) {
    if (state.status === 'showdown' && !state._persisted) await persistHandEnd(state);
    return;
  }
  if (state.pendingSideshow) {
    const targetIdx = state.pendingSideshow.targetSeat;
    const target = state.seats[targetIdx];
    if (target && target.isBot) {
      if (Date.now() < (state._nextBotAt || 0)) return;
      const decision = decideBotSideshow(state, targetIdx);
      respondSideshow(state, target.userId, decision.accept);
      state._nextBotAt = Date.now() + BOT_DELAY_MS;
      if (state.status === 'showdown' && !state._persisted) await persistHandEnd(state);
    }
    return;
  }
  if (state.turnIdx < 0) return;
  const seat = state.seats[state.turnIdx];
  if (!seat || !seat.isBot) return;
  if (Date.now() < (state._nextBotAt || 0)) return;
  const decision = decideBot(state, state.turnIdx);
  if (decision.type === 'see') {
    seeCards(state, seat.userId);
    state._nextBotAt = Date.now() + BOT_DELAY_MS; return;
  }
  playerAction(state, seat.userId, { type: decision.type });
  state._nextBotAt = Date.now() + BOT_DELAY_MS;
  if (state.status === 'showdown' && !state._persisted) await persistHandEnd(state);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
router.post('/auth/signup', async (req, res) => {
  try {
    const username = (req.body.username || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!username || username.length < 3) return void res.status(400).json({ error: 'Username must be 3+ chars' });
    if (!password || password.length < 4) return void res.status(400).json({ error: 'Password must be 4+ chars' });
    const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing) return void res.status(409).json({ error: 'Username taken' });
    const id = uuidv4();
    const startingChips = 0;
    await db.insert(users).values({ id, username, passwordHash: await hashPassword(password), chips: startingChips });
    const token = signToken({ id, username });
    res.json({ token, user: { id, username, chips: startingChips } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user) return void res.status(401).json({ error: 'Invalid credentials' });
    const ok = await verifyPassword(req.body.password || '', user.passwordHash);
    if (!ok) return void res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, chips: user.chips, avatarUrl: user.avatarUrl || null } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/me', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  res.json({ user: { id: a.user.id, username: a.user.username, chips: a.user.chips, avatarUrl: a.user.avatarUrl || null } });
});

router.post('/me/avatar', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const { avatarUrl } = req.body;
    // avatarUrl can be a base64 data URL or null to clear
    if (avatarUrl !== null && avatarUrl !== undefined) {
      if (typeof avatarUrl !== 'string') return void res.status(400).json({ error: 'Invalid avatar' });
      if (avatarUrl.length > 2 * 1024 * 1024) return void res.status(400).json({ error: 'Photo too large (max 2MB)' });
    }
    await db.update(users).set({ avatarUrl: avatarUrl || null }).where(eq(users.id, a.user.id));
    // Also update the live seat if player is at a table
    for (const [, state] of store.tables.entries()) {
      const seat = state.seats.find((s: any) => s && s.userId === a.user.id);
      if (seat) { seat.avatarUrl = avatarUrl || null; bumpVersion(state); }
    }
    res.json({ ok: true, avatarUrl: avatarUrl || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  res.json({ notifications: getNotifications(a.user.id) });
});

router.post('/notifications/respond', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const notif = findNotification(a.user.id, req.body.id);
    if (!notif) return void res.status(404).json({ error: 'Notification not found' });
    const accept = !!req.body.accept;
    if (notif.type === 'friend_request') {
      if (accept) {
        const [ua, ub] = [a.user.id, notif.fromUserId].sort();
        await db.insert(friendships).values({ userA: ua, userB: ub }).onConflictDoNothing();
        pushNotification(notif.fromUserId, {
          type: 'friend_accepted', fromUserId: a.user.id, fromUsername: a.user.username,
          message: `${a.user.username} accepted your friend request`, status: 'done',
        });
      }
      updateNotification(a.user.id, notif.id, { status: accept ? 'accepted' : 'declined' });
      return void res.json({ ok: true });
    }
    // Player clicks "Join Table →" after host accepted — just dismiss and let frontend fetch state
    if (notif.type === 'join_accepted') {
      removeNotification(a.user.id, notif.id);
      const state = notif.tableId ? getTable(notif.tableId) : null;
      return void res.json({ ok: true, tableId: notif.tableId ?? null, tableExists: !!state });
    }
    if (notif.type === 'table_join_request') {
      const state = getTable(notif.tableId);
      if (!state) { updateNotification(a.user.id, notif.id, { status: 'expired' }); return void res.status(404).json({ error: 'Table no longer exists' }); }
      if (accept) {
        const [reqUser] = await db.select().from(users).where(eq(users.id, notif.fromUserId)).limit(1);
        if (!reqUser) return void res.status(404).json({ error: 'Requester not found' });
        // Remove requester from any table they're currently at before adding them here
        const reqExisting = findUserCurrentTable(reqUser.id);
        if (reqExisting && reqExisting.id !== state.id) {
          removePlayer(reqExisting, reqUser.id);
          if (reqExisting.seats.every((s: any) => !s || s.isBot)) store.tables.delete(reqExisting.id);
        }
        const r = addPlayer(state, { userId: reqUser.id, username: reqUser.username, chips: reqUser.chips, avatarUrl: reqUser.avatarUrl || null });
        if (!r.ok) {
          pushNotification(notif.fromUserId, { type: 'join_declined', message: `Could not join: ${r.error}`, status: 'done' });
          return void res.status(400).json({ error: r.error });
        }
        pushNotification(notif.fromUserId, {
          type: 'join_accepted', tableId: state.id, tableCode: state.code,
          message: `${a.user.username} accepted your request. Joining table…`, status: 'done',
        });
      } else {
        pushNotification(notif.fromUserId, { type: 'join_declined', message: `${a.user.username} declined your join request`, status: 'done' });
      }
      updateNotification(a.user.id, notif.id, { status: accept ? 'accepted' : 'declined' });
      return void res.json({ ok: true });
    }
    res.status(400).json({ error: 'Unknown notification type' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/notifications/dismiss', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  removeNotification(a.user.id, req.body.id);
  res.json({ ok: true });
});

// ─── FRIENDS ─────────────────────────────────────────────────────────────────
router.get('/friends', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const frs = await db.select().from(friendships).where(or(eq(friendships.userA, a.user.id), eq(friendships.userB, a.user.id)));
    const friendIds = frs.map(f => f.userA === a.user.id ? f.userB : f.userA);
    const friendDocs = friendIds.length ? await db.select().from(users).where(
      friendIds.length === 1 ? eq(users.id, friendIds[0]) : or(...friendIds.map(id => eq(users.id, id)))
    ) : [];
    const friends = friendDocs.map(u => {
      const table = findUserCurrentTable(u.id);
      return {
        id: u.id, username: u.username, chips: u.chips, online: isOnline(u),
        atTable: table ? { id: table.id, code: table.code, name: table.name, status: table.status, seatsFilled: table.seats.filter((s: any) => s).length, maxPlayers: table.maxPlayers, hasEmptySeat: table.seats.some((s: any) => s === null) } : null,
      };
    });
    const outgoing = await db.select().from(friendRequests).where(and(eq(friendRequests.fromUserId, a.user.id), eq(friendRequests.status, 'pending')));
    const outgoingList = [];
    for (const r of outgoing) {
      const [u] = await db.select().from(users).where(eq(users.id, r.toUserId)).limit(1);
      if (u) outgoingList.push({ id: r.id, username: u.username, createdAt: r.createdAt });
    }
    res.json({ friends, outgoing: outgoingList });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/friends/add', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const target = (req.body.username || '').trim().toLowerCase();
    if (!target) return void res.status(400).json({ error: 'Enter a username' });
    if (target === a.user.username) return void res.status(400).json({ error: 'Cannot friend yourself' });
    const [tu] = await db.select().from(users).where(eq(users.username, target)).limit(1);
    if (!tu) return void res.status(404).json({ error: 'Player not found' });
    const [ua, ub] = [a.user.id, tu.id].sort();
    const [existing] = await db.select().from(friendships).where(and(eq(friendships.userA, ua), eq(friendships.userB, ub))).limit(1);
    if (existing) return void res.status(400).json({ error: 'Already friends' });
    const [pend] = await db.select().from(friendRequests).where(and(eq(friendRequests.fromUserId, a.user.id), eq(friendRequests.toUserId, tu.id), eq(friendRequests.status, 'pending'))).limit(1);
    if (pend) return void res.status(400).json({ error: 'Request already sent' });
    const [reverse] = await db.select().from(friendRequests).where(and(eq(friendRequests.fromUserId, tu.id), eq(friendRequests.toUserId, a.user.id), eq(friendRequests.status, 'pending'))).limit(1);
    if (reverse) {
      await db.insert(friendships).values({ userA: ua, userB: ub }).onConflictDoNothing();
      await db.update(friendRequests).set({ status: 'accepted' }).where(eq(friendRequests.id, reverse.id));
      return void res.json({ ok: true, autoAccepted: true, friend: { id: tu.id, username: tu.username } });
    }
    const reqId = uuidv4();
    await db.insert(friendRequests).values({ id: reqId, fromUserId: a.user.id, toUserId: tu.id });
    pushNotification(tu.id, { type: 'friend_request', fromUserId: a.user.id, fromUsername: a.user.username, requestId: reqId, message: `${a.user.username} wants to be your friend`, status: 'pending' });
    res.json({ ok: true, sent: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/friends/request-join', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const friendId = req.body.friendId;
    const [ua, ub] = [a.user.id, friendId].sort();
    const [fr] = await db.select().from(friendships).where(and(eq(friendships.userA, ua), eq(friendships.userB, ub))).limit(1);
    if (!fr) return void res.status(400).json({ error: 'Not a friend' });
    const friendTable = findUserCurrentTable(friendId);
    if (!friendTable) return void res.status(400).json({ error: 'Friend is not at a table' });
    if (!friendTable.seats.some((s: any) => s === null)) return void res.status(400).json({ error: 'Their table is full' });
    pushNotification(friendId, { type: 'table_join_request', fromUserId: a.user.id, fromUsername: a.user.username, tableId: friendTable.id, tableCode: friendTable.code, tableName: friendTable.name, boot: friendTable.boot, message: `${a.user.username} wants to join your table`, status: 'pending' });
    res.json({ ok: true, sent: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── WALLET / STATS ───────────────────────────────────────────────────────────
router.get('/wallet', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const txs = await db.select().from(transactions).where(eq(transactions.userId, a.user.id)).orderBy(desc(transactions.timestamp)).limit(100);
    res.json({ chips: a.user.chips, transactions: txs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const u = a.user;
    const recentHands = await db.select().from(hands).where(
      sql`players @> ${JSON.stringify([{ userId: u.id }])}::jsonb`
    ).orderBy(desc(hands.endedAt)).limit(30).catch(() => [] as any[]);
    const timeline = recentHands.reverse().map((h: any) => {
      const me = (h.players as any[]).find(pl => pl.userId === u.id);
      const delta = (h.winnerUserId === u.id ? h.pot : 0) - (me?.chipsIn || 0);
      return { handId: h.id, delta, endedAt: h.endedAt };
    });
    let cum = 0;
    const chart = timeline.map((t, i) => ({ i: i + 1, cumulative: (cum += t.delta), delta: t.delta }));
    res.json({ chips: u.chips, handsPlayed: u.handsPlayed, wins: u.wins, losses: u.losses, winRate: u.handsPlayed ? u.wins / u.handsPlayed : 0, netPnL: u.netPnL, totalWon: u.totalWon, totalStaked: u.totalStaked, chart });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    await ensureDefaultAdmin();
    const username = (req.body.username || '').trim().toLowerCase();
    const [admin] = await db.select().from(admins).where(eq(admins.username, username)).limit(1);
    if (!admin) return void res.status(401).json({ error: 'Invalid credentials' });
    const ok = await verifyPassword(req.body.password || '', admin.passwordHash);
    if (!ok) return void res.status(401).json({ error: 'Invalid credentials' });
    const token = signAdminToken({ id: admin.id, username: admin.username });
    await logAdminAction(admin, 'admin_login', null, {});
    res.json({ token, admin: { id: admin.id, username: admin.username } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/stats', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const [allUsers, recentHands, tipTxs] = await Promise.all([
      db.select().from(users),
      db.select().from(hands).orderBy(desc(hands.endedAt)).limit(500),
      db.select().from(transactions).where(eq(transactions.type, 'tip')),
    ]);
    const totalChips = allUsers.reduce((a, u) => a + u.chips, 0);
    const totalStaked = allUsers.reduce((a, u) => a + u.totalStaked, 0);
    const totalTips = tipTxs.reduce((a, t) => a + Math.abs(t.amount), 0);
    const losers = allUsers.filter(u => u.netPnL < 0);
    const winners = allUsers.filter(u => u.netPnL > 0);
    const avgLossPct = losers.length ? losers.reduce((a, u) => a + (Math.abs(u.netPnL) / Math.max(1, u.totalStaked)), 0) / losers.length * 100 : 0;
    const now = new Date();
    const circulation = Array.from({ length: 14 }, (_, i) => {
      const d = 13 - i;
      const start = new Date(now); start.setDate(now.getDate() - d); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 1);
      const dayHands = recentHands.filter(h => h.endedAt >= start && h.endedAt < end);
      return { date: start.toISOString().slice(5, 10), hands: dayHands.length, circulation: dayHands.reduce((a, h) => a + h.pot, 0) };
    });
    res.json({
      totalUsers: allUsers.length, totalChips, totalHands: recentHands.length, totalStaked, totalTips,
      losersCount: losers.length, winnersCount: winners.length, avgLossPct: Math.round(avgLossPct * 100) / 100,
      topWinners: [...allUsers].sort((a, b) => b.netPnL - a.netPnL).slice(0, 5).map(u => ({ id: u.id, username: u.username, netPnL: u.netPnL, handsPlayed: u.handsPlayed })),
      topLosers: [...allUsers].sort((a, b) => a.netPnL - b.netPnL).slice(0, 5).map(u => ({ id: u.id, username: u.username, netPnL: u.netPnL, handsPlayed: u.handsPlayed })),
      circulation, activeTables: store.tables.size,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/users', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const q = (req.query.q as string || '').trim();
    let allUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
    if (q) allUsers = allUsers.filter(u => u.username.includes(q.toLowerCase()));
    res.json({ users: allUsers.map(u => ({ id: u.id, username: u.username, chips: u.chips, handsPlayed: u.handsPlayed, wins: u.wins, losses: u.losses, netPnL: u.netPnL, createdAt: u.createdAt })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/users/:id/adjust', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const [admin] = await db.select().from(admins).where(eq(admins.id, adminPayload.id)).limit(1);
    if (!admin) return void res.status(401).json({ error: 'Admin not found' });
    const amount = Math.round(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount === 0) return void res.status(400).json({ error: 'Amount must be non-zero integer' });
    const [u] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!u) return void res.status(404).json({ error: 'User not found' });
    const newChips = Math.max(0, u.chips + amount);
    await db.update(users).set({ chips: newChips }).where(eq(users.id, u.id));
    await db.insert(transactions).values({ id: uuidv4(), userId: u.id, type: newChips >= u.chips ? 'admin_credit' : 'admin_debit', amount: newChips - u.chips, balanceBefore: u.chips, balanceAfter: newChips, adminId: admin.id, note: req.body.note || 'Admin adjustment' }).catch(() => {});
    await logAdminAction(admin, 'chip_adjust', { id: u.id, username: u.username }, { amount, newChips });
    for (const [, ts] of store.tables.entries()) {
      const seat = ts.seats.find((s: any) => s && s.userId === u.id);
      if (seat) { seat.chips = newChips; bumpVersion(ts); }
    }
    res.json({ user: { id: u.id, username: u.username, chips: newChips }, applied: newChips - u.chips });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/users/:id/reset', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const [admin] = await db.select().from(admins).where(eq(admins.id, adminPayload.id)).limit(1);
    if (!admin) return void res.status(401).json({ error: 'Admin not found' });
    const [u] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!u) return void res.status(404).json({ error: 'User not found' });
    const DEFAULT_CHIPS = 5000;
    await db.update(users).set({ chips: DEFAULT_CHIPS }).where(eq(users.id, u.id));
    await db.insert(transactions).values({ id: uuidv4(), userId: u.id, type: 'admin_reset', amount: DEFAULT_CHIPS - u.chips, balanceBefore: u.chips, balanceAfter: DEFAULT_CHIPS, adminId: admin.id, note: 'Admin chip reset' }).catch(() => {});
    await logAdminAction(admin, 'chip_reset', { id: u.id, username: u.username }, { from: u.chips, to: DEFAULT_CHIPS });
    for (const [, ts] of store.tables.entries()) {
      const seat = ts.seats.find((s: any) => s && s.userId === u.id);
      if (seat) { seat.chips = DEFAULT_CHIPS; bumpVersion(ts); }
    }
    res.json({ user: { id: u.id, username: u.username, chips: DEFAULT_CHIPS } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/users/:id/txns', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const txns = await db.select().from(transactions).where(eq(transactions.userId, req.params.id)).orderBy(desc(transactions.timestamp)).limit(50);
    res.json({ transactions: txns });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/tables', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const tables = [];
    for (const [, state] of store.tables.entries()) {
      tables.push({
        id: state.id, code: state.code, name: state.name, isPublic: state.isPublic,
        boot: state.boot, status: state.status, pot: state.pot,
        seats: state.seats.map((s: any) => s ? { username: s.username, chips: s.chips, isBot: s.isBot, folded: s.folded, inHand: s.inHand } : null),
        updatedAt: state.updatedAt,
      });
    }
    res.json({ tables });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/logs', async (req, res) => {
  try {
    const adminPayload = getAdminAuth(req);
    if (!adminPayload) return void res.status(401).json({ error: 'Admin auth required' });
    const logs = await db.select().from(adminLogs).orderBy(desc(adminLogs.timestamp)).limit(100);
    res.json({ logs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── TABLES ───────────────────────────────────────────────────────────────────
router.post('/tables', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    // Leave any existing table before creating a new one
    const existingTable = findUserCurrentTable(a.user.id);
    if (existingTable) {
      removePlayer(existingTable, a.user.id);
      if (existingTable.seats.every((s: any) => !s || s.isBot)) store.tables.delete(existingTable.id);
    }
    const name = (req.body.name || `${a.user.username}'s table`).slice(0, 40);
    const isPublic = !!req.body.isPublic;
    const boot = Math.max(1, Math.min(100000, Number(req.body.boot) || 10));
    const maxPlayers = Math.max(3, Math.min(6, Number(req.body.maxPlayers) || 6));
    const code = genCode();
    const id = uuidv4();
    const state = createTableState({ id, code, name, isPublic, hostId: a.user.id, boot, maxPlayers });
    addPlayer(state, { userId: a.user.id, username: a.user.username, chips: a.user.chips, avatarUrl: a.user.avatarUrl || null });
    store.tables.set(id, state);
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tables', async (req, res) => {
  const list = [];
  for (const [id, state] of store.tables.entries()) {
    if (!state.isPublic) continue;
    list.push({ id, code: state.code, name: state.name, boot: state.boot, players: state.seats.filter((s: any) => s).length, maxPlayers: state.maxPlayers, status: state.status });
  }
  res.json({ tables: list });
});

router.post('/tables/join', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const code = (req.body.code || '').trim().toUpperCase();
    let state: any = null;
    for (const [, s] of store.tables.entries()) { if (s.code === code) { state = s; break; } }
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    // Leave any existing table before joining a new one
    const existingTable = findUserCurrentTable(a.user.id);
    if (existingTable && existingTable.id !== state.id) {
      removePlayer(existingTable, a.user.id);
      if (existingTable.seats.every((s: any) => !s || s.isBot)) store.tables.delete(existingTable.id);
    }
    const r = addPlayer(state, { userId: a.user.id, username: a.user.username, chips: a.user.chips, avatarUrl: a.user.avatarUrl || null });
    if (!r.ok) return void res.status(400).json({ error: r.error });
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tables/:id/state', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    // Track last poll time so the stale-player cleanup knows who is still connected
    const mySeat = state.seats.find((s: any) => s && s.userId === a.user.id);
    if (mySeat) mySeat.lastSeenAt = Date.now();
    await advanceBots(state);
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/leave', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    removePlayer(state, a.user.id);
    if (state.seats.every((s: any) => !s || s.isBot)) store.tables.delete(req.params.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/start', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    for (const s of state.seats) {
      if (s && !s.isBot) {
        const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
        if (u) s.chips = u.chips;
      }
    }
    const r = startHand(state);
    if (!r.ok) return void res.status(400).json({ error: r.error });
    state._persisted = false;
    const seat = state.seats[state.turnIdx];
    if (seat && seat.isBot) state._nextBotAt = Date.now() + BOT_DELAY_MS;
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/action', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    const r = playerAction(state, a.user.id, { type: req.body.type });
    if (!r.ok) return void res.status(400).json({ error: r.error });
    const seat = state.seats[state.turnIdx];
    if (seat && seat.isBot) state._nextBotAt = Date.now() + BOT_DELAY_MS;
    if (state.pendingSideshow) {
      const t = state.seats[state.pendingSideshow.targetSeat];
      if (t?.isBot) state._nextBotAt = Date.now() + BOT_DELAY_MS;
    }
    if (state.status === 'showdown' && !state._persisted) await persistHandEnd(state);
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/sideshow', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    const r = respondSideshow(state, a.user.id, !!req.body.accept);
    if (!r.ok) return void res.status(400).json({ error: r.error });
    const seatT = state.seats[state.turnIdx];
    if (seatT && seatT.isBot) state._nextBotAt = Date.now() + BOT_DELAY_MS;
    if (state.status === 'showdown' && !state._persisted) await persistHandEnd(state);
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/see', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    const r = seeCards(state, a.user.id);
    if (!r.ok) return void res.status(400).json({ error: r.error });
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/tip', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    const seatIdx = findSeat(state, a.user.id);
    if (seatIdx < 0) return void res.status(403).json({ error: 'Not seated at this table' });
    const amount = Math.round(Number(req.body.amount) || 0);
    if (amount < 1 || amount > 10000) return void res.status(400).json({ error: 'Tip must be between ₹1 and ₹10,000' });
    const [u] = await db.select().from(users).where(eq(users.id, a.user.id)).limit(1);
    if (!u) return void res.status(404).json({ error: 'User not found' });
    if (u.chips < amount) return void res.status(400).json({ error: 'Not enough chips' });
    const newChips = u.chips - amount;
    await db.update(users).set({ chips: newChips }).where(eq(users.id, a.user.id));
    // Sync in-memory seat
    const seat = state.seats[seatIdx];
    if (seat) seat.chips = newChips;
    // Record tip transaction (chips go to house — not credited to any player)
    await db.insert(transactions).values({
      id: uuidv4(), userId: a.user.id, type: 'tip', amount: -amount,
      balanceBefore: u.chips, balanceAfter: newChips,
      tableId: state.id, note: 'Dealer tip',
    }).catch(() => {});
    state.log.push(`${a.user.username} tipped the dealer ₹${amount} 💸`);
    bumpVersion(state);
    res.json({ ok: true, chips: newChips, table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/chat', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    if (findSeat(state, a.user.id) < 0) return void res.status(403).json({ error: 'Not seated at this table' });
    const msg = (req.body.message || '').slice(0, 200);
    if (!msg) return void res.status(400).json({ error: 'Empty message' });
    state.chat.push({ id: uuidv4(), userId: a.user.id, username: a.user.username, message: msg, ts: Date.now() });
    bumpVersion(state);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/bots', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    if (state.hostId !== a.user.id) return void res.status(403).json({ error: 'Only host can add bots' });
    const names = ['Bot Ravi', 'Bot Maya', 'Bot Arjun', 'Bot Zara', 'Bot Kabir', 'Bot Nina'];
    const empty = state.seats.findIndex((s: any) => s === null);
    if (empty < 0) return void res.status(400).json({ error: 'Table full' });
    const used = new Set(state.seats.filter((s: any) => s).map((s: any) => s.username));
    const name = names.find(n => !used.has(n)) || `Bot ${empty}`;
    addPlayer(state, { userId: 'bot_' + uuidv4().slice(0, 8), username: name, chips: 3000, isBot: true });
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tables/:id/kick', async (req, res) => {
  try {
    const a = await requireAuth(req, res); if (!a) return;
    const state = getTable(req.params.id);
    if (!state) return void res.status(404).json({ error: 'Table not found' });
    const seatIdx = Number(req.body.seat);
    const s = state.seats[seatIdx];
    if (!s) return void res.status(400).json({ error: 'Empty seat' });
    if (state.hostId !== a.user.id) return void res.status(403).json({ error: 'Only host can kick' });
    if (!s.isBot) return void res.status(400).json({ error: 'Only bots can be kicked' });
    state.seats[seatIdx] = null;
    state.log.push(`${s.username} removed`);
    bumpVersion(state);
    res.json({ table: publicTableView(state, a.user.id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Stale-player cleanup ─────────────────────────────────────────────────────
// If a player closes their tab without clicking Leave, they never hit the leave
// endpoint.  We track lastSeenAt (updated on every poll) and periodically evict
// players who haven't polled in STALE_PLAYER_MS.  Once every real player is
// gone, the table itself is deleted.
const STALE_PLAYER_MS = 90_000; // 90 s — frontend polls every 2 s, so this is very generous
const STALE_TABLE_MS  = 5 * 60_000; // 5 min — delete lobby-only tables that were never joined

function runStaleCleanup(): void {
  const now = Date.now();
  for (const [tableId, state] of store.tables.entries()) {
    // 1. Remove real players that have gone stale (no poll in STALE_PLAYER_MS)
    for (let i = 0; i < state.seats.length; i++) {
      const s = state.seats[i];
      if (!s || s.isBot) continue;
      const lastSeen = s.lastSeenAt ?? 0;
      if (lastSeen > 0 && now - lastSeen > STALE_PLAYER_MS) {
        removePlayer(state, s.userId);
        state.log.push(`${s.username} removed (connection lost)`);
        bumpVersion(state);
      }
    }
    // 1b. Advance turn if the current player timed out (handles hands where all
    //     humans disconnected and only bots remain — otherwise the hand stalls)
    if (state.status === 'in_hand') {
      checkTurnTimeout(state, 15_000);
    }

    // 2. Delete the table when no real players remain
    const hasRealPlayer = state.seats.some((s: any) => s && !s.isBot);
    if (!hasRealPlayer) {
      deleteTable(tableId);
      continue;
    }

    // 3. Delete stale lobby tables that nobody has touched in a long time
    if (state.status === 'lobby' && now - state.updatedAt > STALE_TABLE_MS) {
      deleteTable(tableId);
    }
  }
}

// Run cleanup every 60 seconds
setInterval(runStaleCleanup, 60_000).unref();

export default router;
