import { evaluate } from './deck.js';
import type { TableState } from './gameEngine.js';

export function decideBot(state: TableState, seatIdx: number): { type: string } {
  const s = state.seats[seatIdx]!;
  const ev = evaluate(s.cards!);
  const stake = state.currentStake;
  const active = state.seats.filter(x => x && x.inHand && !x.folded).length;

  if (!s.seen && Math.random() < 0.45) return { type: 'see' };

  if (s.seen && active >= 3 && (state.turnCount || 0) >= active) {
    if (ev.rank >= 2 && Math.random() < 0.2) return { type: 'sideshow' };
  }

  if (ev.rank >= 4) {
    if (active === 2 && Math.random() < 0.6) return { type: 'show' };
    return { type: Math.random() < 0.5 ? 'double' : 'chaal' };
  }
  if (ev.rank === 3) return { type: Math.random() < 0.3 ? 'double' : 'chaal' };
  if (ev.rank === 2) {
    if (active === 2 && Math.random() < 0.4) return { type: 'show' };
    return { type: Math.random() < 0.25 ? 'double' : 'chaal' };
  }

  const cost = s.isBlind ? stake : 2 * stake;
  if (s.chips < cost) return { type: 'pack' };
  if (stake > 40 && Math.random() < 0.6) return { type: 'pack' };
  if (Math.random() < 0.25) return { type: 'pack' };
  return { type: 'chaal' };
}

export function decideBotSideshow(state: TableState, targetSeatIdx: number): { accept: boolean } {
  const target = state.seats[targetSeatIdx]!;
  const ev = evaluate(target.cards!);
  if (ev.rank >= 4) return { accept: true };
  if (ev.rank === 2 || ev.rank === 3) return { accept: Math.random() < 0.7 };
  return { accept: Math.random() < 0.35 };
}
