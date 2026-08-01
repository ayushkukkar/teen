import { newDeck, shuffle, evaluate, compareHands, type Card } from './deck.js';
import { bumpVersion } from './gameStore.js';

export interface SeatState {
  userId: string; username: string; isBot: boolean;
  chips: number; cards: Card[] | null; seen: boolean;
  folded: boolean; inHand: boolean; chipsInPot: number; isBlind: boolean;
  seat?: number;
  avatarUrl?: string | null;
  lastSeenAt?: number; // ms timestamp — updated each time the player polls table state
}

export interface TableState {
  id: string; code: string; name: string; isPublic: boolean; hostId: string;
  boot: number; maxPlayers: number; status: 'lobby' | 'in_hand' | 'showdown';
  seats: (SeatState | null)[]; dealerIdx: number; turnIdx: number;
  currentStake: number; pot: number; phase: string; log: string[];
  chat: any[]; winnerIdx: number; version: number; handId: string | null;
  updatedAt: number; showdownReveal: boolean; lastActionAt: number;
  handStartedAt: number; turnCount: number;
  pendingSideshow: { requesterSeat: number; targetSeat: number; requestedAt: number; cost: number } | null;
  sideshowResult: any; showCallerSeat: number; turnStartedAt: number;
  sideshowRevealSeats: [number, number] | null;
  sideshowRevealAt: number | null;
  _persisted?: boolean; _nextBotAt?: number;
}

export function createTableState({ id, code, name, isPublic, hostId, boot = 10, maxPlayers = 6 }: any): TableState {
  return {
    id, code, name, isPublic, hostId, boot, maxPlayers,
    status: 'lobby', seats: new Array(maxPlayers).fill(null),
    dealerIdx: -1, turnIdx: -1, currentStake: boot, pot: 0, phase: 'idle',
    log: [], chat: [], winnerIdx: -1, handId: null, version: 1,
    updatedAt: Date.now(), showdownReveal: false, lastActionAt: Date.now(),
    handStartedAt: 0, turnCount: 0, pendingSideshow: null, sideshowResult: null,
    showCallerSeat: -1, turnStartedAt: 0,
    sideshowRevealSeats: null, sideshowRevealAt: null,
  };
}

export function findSeat(state: TableState, userId: string): number {
  return state.seats.findIndex(s => s && s.userId === userId);
}

export function addPlayer(state: TableState, { userId, username, chips, isBot = false, avatarUrl = null }: any): { ok: boolean; seat?: number; error?: string } {
  if (findSeat(state, userId) >= 0) return { ok: true, seat: findSeat(state, userId) };
  const idx = state.seats.findIndex(s => s === null);
  if (idx < 0) return { ok: false, error: 'Table full' };
  state.seats[idx] = { userId, username, isBot, chips, cards: null, seen: false, folded: false, inHand: false, chipsInPot: 0, isBlind: true, avatarUrl };
  state.log.push(`${username} joined seat ${idx + 1}`);
  bumpVersion(state);
  return { ok: true, seat: idx };
}

export function removePlayer(state: TableState, userId: string): { ok: boolean } {
  const idx = findSeat(state, userId);
  if (idx < 0) return { ok: false };
  const name = state.seats[idx]!.username;
  if (state.status === 'in_hand' && state.seats[idx]!.inHand && !state.seats[idx]!.folded) {
    state.seats[idx]!.folded = true; state.seats[idx]!.inHand = false;
    state.log.push(`${name} left (auto-pack)`);
  } else {
    state.log.push(`${name} left`);
  }
  state.seats[idx] = null;
  bumpVersion(state);
  if (state.status === 'in_hand') maybeResolve(state);
  return { ok: true };
}

export function activeSeatCount(state: TableState): number {
  return state.seats.filter(s => s && s.inHand && !s.folded).length;
}

export function startHand(state: TableState): { ok: boolean; error?: string } {
  const occupied = state.seats.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  if (occupied.length < 2) return { ok: false, error: 'Need at least 2 players' };
  const canPlay = occupied.filter(i => state.seats[i]!.chips >= state.boot);
  if (canPlay.length < 2) return { ok: false, error: 'Not enough players can afford boot' };
  state.status = 'in_hand'; state.phase = 'betting'; state.pot = 0;
  state.currentStake = state.boot; state.winnerIdx = -1; state.showdownReveal = false;
  state.handId = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  state.handStartedAt = Date.now(); state.turnCount = 0;
  state.pendingSideshow = null; state.sideshowResult = null; state.showCallerSeat = -1;
  state.sideshowRevealSeats = null; state.sideshowRevealAt = null;
  state.turnStartedAt = Date.now() + 2500;
  const deck = shuffle(newDeck()); let ci = 0;
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i]; if (!s) continue;
    s.cards = null; s.seen = false; s.folded = false; s.inHand = false; s.chipsInPot = 0; s.isBlind = true;
    if (canPlay.includes(i)) {
      s.chips -= state.boot; s.chipsInPot = state.boot; state.pot += state.boot;
      s.cards = [deck[ci++], deck[ci++], deck[ci++]]; s.inHand = true;
    }
  }
  state.dealerIdx = nextOccupiedFrom(state, state.dealerIdx + 1);
  // First turn goes to the seat immediately after the dealer (counter-clockwise / left-to-right visually)
  state.turnIdx = nextInHandFrom(state, state.dealerIdx + 1);
  state.log.push(`New hand started. Boot ${state.boot}. Pot ${state.pot}. Dealer: seat ${state.dealerIdx + 1}. First turn: seat ${state.turnIdx + 1}.`);
  state.lastActionAt = Date.now();
  bumpVersion(state);
  return { ok: true };
}

function nextOccupiedFrom(state: TableState, start: number): number {
  const n = state.seats.length;
  for (let k = 0; k < n; k++) { const i = (start + k) % n; if (state.seats[i]) return i; }
  return -1;
}
function nextInHandFrom(state: TableState, start: number): number {
  const n = state.seats.length;
  for (let k = 0; k < n; k++) { const i = (start + k) % n; if (state.seats[i]?.inHand && !state.seats[i]?.folded) return i; }
  return -1;
}
function prevInHandFrom(state: TableState, start: number): number {
  const n = state.seats.length;
  for (let k = 0; k < n; k++) { const i = ((start - k) % n + n) % n; if (state.seats[i]?.inHand && !state.seats[i]?.folded) return i; }
  return -1;
}
function advanceTurn(state: TableState): void {
  state.turnIdx = nextInHandFrom(state, state.turnIdx + 1); state.turnStartedAt = Date.now();
}

export function checkTurnTimeout(state: TableState, timeoutMs = 15_000): boolean {
  if (state.status !== 'in_hand' || state.pendingSideshow || state.turnIdx < 0) return false;
  const seat = state.seats[state.turnIdx];
  if (!seat || seat.isBot) return false;
  const started = state.turnStartedAt || 0;
  if (!started || Date.now() - started < timeoutMs) return false;
  seat.folded = true; seat.inHand = false;
  state.log.push(`${seat.username} timed out — auto-packed`);
  state.turnCount = (state.turnCount || 0) + 1; state.lastActionAt = Date.now();
  bumpVersion(state); maybeResolve(state);
  if (state.status === 'in_hand') advanceTurn(state);
  bumpVersion(state);
  return true;
}

export function seeCards(state: TableState, userId: string): { ok: boolean; error?: string } {
  const idx = findSeat(state, userId); if (idx < 0) return { ok: false, error: 'Not seated' };
  const s = state.seats[idx]!;
  if (!s.inHand || s.folded) return { ok: false, error: 'Not in hand' };
  if (s.seen) return { ok: false, error: 'Already seen' };
  s.seen = true; s.isBlind = false;
  state.log.push(`${s.username} saw cards`); bumpVersion(state);
  return { ok: true };
}

export function playerAction(state: TableState, userId: string, { type }: { type: string }): { ok: boolean; error?: string } {
  const idx = findSeat(state, userId); if (idx < 0) return { ok: false, error: 'Not seated' };
  if (state.status !== 'in_hand') return { ok: false, error: 'No active hand' };
  if (state.pendingSideshow) return { ok: false, error: 'Waiting for sideshow response' };
  if (state.turnIdx !== idx) return { ok: false, error: 'Not your turn' };
  const s = state.seats[idx]!;
  if (s.folded || !s.inHand) return { ok: false, error: 'Not in hand' };
  const active = activeSeatCount(state);

  if (type === 'sideshow') {
    if (!s.seen) return { ok: false, error: 'You must see cards first' };
    if (active < 3) return { ok: false, error: 'Sideshow only when 3+ players remain' };
    const prevIdx = prevInHandFrom(state, idx - 1);
    if (prevIdx < 0 || prevIdx === idx) return { ok: false, error: 'No opponent available' };
    const prev = state.seats[prevIdx]!;
    if (!prev.seen) return { ok: false, error: 'Previous player must also be seen' };
    if ((state.turnCount || 0) < active) return { ok: false, error: 'Wait until at least one full round is complete' };
    const cost = 2 * state.currentStake;
    if (s.chips < cost) return { ok: false, error: 'Insufficient chips for sideshow' };
    s.chips -= cost; s.chipsInPot += cost; state.pot += cost;
    state.pendingSideshow = { requesterSeat: idx, targetSeat: prevIdx, requestedAt: Date.now(), cost };
    state.log.push(`${s.username} requested SIDESHOW with ${prev.username}`);
    state.lastActionAt = Date.now(); bumpVersion(state);
    return { ok: true };
  }
  if (type === 'pack') {
    s.folded = true; s.inHand = false; state.log.push(`${s.username} packed`);
  } else if (type === 'chaal' || type === 'double') {
    const stake = state.currentStake;
    const put = s.isBlind ? (type === 'double' ? 2 * stake : stake) : (type === 'double' ? 4 * stake : 2 * stake);
    if (s.chips < put) return { ok: false, error: 'Insufficient chips' };
    s.chips -= put; s.chipsInPot += put; state.pot += put;
    state.currentStake = s.isBlind ? put : put / 2;
    state.log.push(`${s.username} ${s.isBlind ? '(blind)' : '(seen)'} ${type === 'double' ? 'raised' : 'chaal'} ${put}. Stake: ${state.currentStake}.`);
  } else if (type === 'show') {
    if (active !== 2) return { ok: false, error: 'Show only allowed when 2 players remain' };
    const stake = state.currentStake;
    const cost = s.isBlind ? stake : 2 * stake;
    if (s.chips < cost) return { ok: false, error: 'Insufficient chips for show' };
    s.chips -= cost; s.chipsInPot += cost; state.pot += cost;
    state.showCallerSeat = idx;
    state.log.push(`${s.username} called SHOW for ${cost}`);
    state.showdownReveal = true; resolveShowdown(state);
    return { ok: true };
  } else {
    return { ok: false, error: 'Unknown action' };
  }
  state.turnCount = (state.turnCount || 0) + 1; state.lastActionAt = Date.now();
  bumpVersion(state); maybeResolve(state);
  if (state.status === 'in_hand') advanceTurn(state);
  bumpVersion(state);
  return { ok: true };
}

export function respondSideshow(state: TableState, userId: string, accept: boolean): { ok: boolean; error?: string } {
  if (!state.pendingSideshow) return { ok: false, error: 'No pending sideshow' };
  const { requesterSeat, targetSeat } = state.pendingSideshow;
  const target = state.seats[targetSeat]!; const requester = state.seats[requesterSeat]!;
  if (!target || target.userId !== userId) return { ok: false, error: 'Not your sideshow to answer' };
  if (accept) {
    const reqEv = evaluate(requester.cards!); const tarEv = evaluate(target.cards!);
    const cmp = compareHands(reqEv, tarEv);
    const loser = cmp > 0 ? targetSeat : requesterSeat;
    state.seats[loser]!.folded = true; state.seats[loser]!.inHand = false;
    state.log.push(`SIDESHOW: ${target.username} accepted. ${state.seats[loser]!.username} lost and packed.`);
    state.sideshowResult = { targetAccepted: true, loserSeat: loser, requesterSeat, targetSeat, at: Date.now(), reqLabel: reqEv.label, tarLabel: tarEv.label };
    state.sideshowRevealSeats = [requesterSeat, targetSeat]; state.sideshowRevealAt = Date.now();
    if (state.turnIdx === loser) advanceTurn(state);
    if (state.turnIdx === requesterSeat) advanceTurn(state);
  } else {
    state.log.push(`SIDESHOW: ${target.username} declined. Play continues.`);
    state.sideshowResult = { targetAccepted: false, requesterSeat, targetSeat, at: Date.now() };
    advanceTurn(state);
  }
  state.pendingSideshow = null; state.turnCount = (state.turnCount || 0) + 1;
  state.lastActionAt = Date.now(); bumpVersion(state); maybeResolve(state); bumpVersion(state);
  return { ok: true };
}

export function maybeResolve(state: TableState): void {
  const active = activeSeatCount(state);
  if (active <= 1) {
    const winIdx = state.seats.findIndex(s => s && s.inHand && !s.folded);
    if (winIdx >= 0) {
      state.seats[winIdx]!.chips += state.pot; state.winnerIdx = winIdx;
      state.log.push(`${state.seats[winIdx]!.username} wins ${state.pot} (all others packed)`);
    }
    endHand(state);
  }
}

export function resolveShowdown(state: TableState): void {
  const contenders = state.seats.map((s, i) => (s && s.inHand && !s.folded ? i : -1)).filter(i => i >= 0);
  const evals = contenders.map(i => ({ i, ev: evaluate(state.seats[i]!.cards!) }));
  evals.sort((a, b) => {
    const c = compareHands(b.ev, a.ev); if (c !== 0) return c;
    if (a.i === state.showCallerSeat) return 1;
    if (b.i === state.showCallerSeat) return -1;
    return 0;
  });
  const winnerIdx = evals[0].i; state.seats[winnerIdx]!.chips += state.pot; state.winnerIdx = winnerIdx;
  const winEv = evals[0].ev; const loserEv = evals[1]?.ev;
  state.log.push(`SHOWDOWN: ${state.seats[winnerIdx]!.username} wins ${state.pot} with ${winEv.label}${loserEv ? ` (beats ${loserEv.label})` : ''}`);
  endHand(state);
}

function endHand(state: TableState): void {
  state.status = 'showdown'; state.phase = 'ended'; state.showdownReveal = true;
  state.lastActionAt = Date.now(); bumpVersion(state);
}

export function computePnL(state: TableState): Array<{ userId: string; seat: number; delta: number; isBot: boolean; chipsIn: number; won: number }> {
  const result = [];
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i]; if (!s || s.chipsInPot === 0) continue;
    const won = i === state.winnerIdx ? state.pot : 0;
    result.push({ userId: s.userId, seat: i, delta: won - s.chipsInPot, isBot: s.isBot, chipsIn: s.chipsInPot, won });
  }
  return result;
}
