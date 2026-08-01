// Card representation: {r: 2-14 (11=J,12=Q,13=K,14=A), s: 'S'|'H'|'D'|'C'}
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Card = { r: number; s: Suit };
export type HandEval = { rank: number; key: number[]; label: string };

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANK_NAMES: Record<number, string> = {
  2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',
};

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) deck.push({ r, s });
  }
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function cardStr(c: Card): string {
  return RANK_NAMES[c.r] + c.s;
}

// Hand ranks: 6=Trail, 5=PureSeq, 4=Seq, 3=Color, 2=Pair, 1=HighCard
export function evaluate(cards: Card[]): HandEval {
  const sorted = [...cards].sort((a, b) => b.r - a.r);
  const ranks = sorted.map(c => c.r);
  const suits = sorted.map(c => c.s);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
  let isSeq = false;
  let seqHigh = 0;
  if (ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1) {
    isSeq = true; seqHigh = ranks[0];
  } else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) {
    isSeq = true; seqHigh = 3.5;
  }
  const uniqueRanks = new Set(ranks).size;
  if (uniqueRanks === 1) return { rank: 6, key: [ranks[0]], label: 'Trail' };
  if (isSeq && isFlush) {
    let key: number[];
    if (seqHigh === 14) key = [15];
    else if (seqHigh === 3.5) key = [14];
    else key = [seqHigh];
    return { rank: 5, key, label: 'Pure Sequence' };
  }
  if (isSeq) {
    let key: number[];
    if (seqHigh === 14) key = [15];
    else if (seqHigh === 3.5) key = [14];
    else key = [seqHigh];
    return { rank: 4, key, label: 'Sequence' };
  }
  if (isFlush) return { rank: 3, key: ranks, label: 'Color' };
  if (uniqueRanks === 2) {
    const pairRank = ranks[0] === ranks[1] ? ranks[0] : ranks[1];
    const kicker = ranks[0] === ranks[1] ? ranks[2] : ranks[0];
    return { rank: 2, key: [pairRank, kicker], label: 'Pair' };
  }
  return { rank: 1, key: ranks, label: 'High Card' };
}

export function compareHands(a: HandEval, b: HandEval): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
    const ka = a.key[i] || 0, kb = b.key[i] || 0;
    if (ka !== kb) return ka - kb;
  }
  return 0;
}
