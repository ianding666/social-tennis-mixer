import type { Match, MatchFormat, PairingMode, Round, SessionConfig } from './types';
import { shuffle } from './util';

export interface PlayerLite {
  id: string;
  grade: number;
  gender: 'M' | 'F';
}

export interface DrawHistory {
  partnerCount: Map<string, number>;
  opponentCount: Map<string, number>;
  playedCount: Map<string, number>;
  lastByes: Set<string>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Build cumulative history from already-played/locked rounds. */
export function deriveHistory(rounds: Round[]): DrawHistory {
  const partnerCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const playedCount = new Map<string, number>();
  let lastByes = new Set<string>();

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const side of [match.sideA, match.sideB]) {
        for (const p of side) bump(playedCount, p);
        if (side.length === 2) bump(partnerCount, pairKey(side[0], side[1]));
      }
      for (const a of match.sideA) for (const b of match.sideB) bump(opponentCount, pairKey(a, b));
    }
    lastByes = new Set(round.byes);
  }

  return { partnerCount, opponentCount, playedCount, lastByes };
}

export interface RoundPlan {
  byeCount: number;
  formats: MatchFormat[];
}

/** Decide how many Byes and the court formats for a given attendance. */
export function planRound(activeCount: number, courtCount: number): RoundPlan {
  const n = activeCount;
  const doublesCourts = Math.min(courtCount, Math.floor(n / 4));
  const remaining = n - doublesCourts * 4;
  const formats: MatchFormat[] = Array(doublesCourts).fill('doubles');
  const hasSpareCourt = doublesCourts < courtCount;

  if (remaining === 0) return { byeCount: 0, formats };
  // All courts are full as doubles: every leftover player sits out.
  if (!hasSpareCourt) return { byeCount: remaining, formats };
  // A spare court is free, so remaining is 1–3.
  if (remaining === 1) return { byeCount: 1, formats };
  if (remaining === 2) return { byeCount: 0, formats: [...formats, 'singles'] };
  // remaining === 3
  return { byeCount: 0, formats: [...formats, 'uneven'] };
}

/** Pick who sits out: most rounds played first, avoid back-to-back, random ties. */
export function selectByes(active: PlayerLite[], byeCount: number, history: DrawHistory): string[] {
  if (byeCount <= 0) return [];
  const ordered = shuffle(active).sort((a, b) => {
    const playedDiff = (history.playedCount.get(b.id) ?? 0) - (history.playedCount.get(a.id) ?? 0);
    if (playedDiff !== 0) return playedDiff;
    const aLast = history.lastByes.has(a.id) ? 1 : 0;
    const bLast = history.lastByes.has(b.id) ? 1 : 0;
    return aLast - bLast; // players who byed last round sorted later (less likely chosen)
  });
  return ordered.slice(0, byeCount).map((p) => p.id);
}

const W_EVEN = 1000;
const W_EVEN_SOFT = 0.5;
const W_MODE_BALANCED = 150;
const W_MODE_MIXED = 3;
const W_GENDER = 60;
const W_PARTNER = 12;
const W_OPPONENT = 1.5;

function avg(grades: number[]): number {
  return grades.reduce((s, g) => s + g, 0) / grades.length;
}

/** Turn an ordered slot array into matches, canonicalising odd formats by grade. */
function slotsToMatches(slots: PlayerLite[], formats: MatchFormat[]): Match[] {
  const matches: Match[] = [];
  let i = 0;
  formats.forEach((format, court) => {
    if (format === 'doubles') {
      const g = slots.slice(i, i + 4);
      matches.push({ court: court + 1, format, sideA: [g[0].id, g[1].id], sideB: [g[2].id, g[3].id] });
      i += 4;
    } else if (format === 'singles') {
      const g = slots.slice(i, i + 2);
      matches.push({ court: court + 1, format, sideA: [g[0].id], sideB: [g[1].id] });
      i += 2;
    } else {
      // uneven: strongest (lowest grade) plays alone
      const g = slots.slice(i, i + 3).sort((a, b) => a.grade - b.grade);
      matches.push({ court: court + 1, format, sideA: [g[0].id], sideB: [g[1].id, g[2].id] });
      i += 3;
    }
  });
  return matches;
}

function scoreMatches(
  matches: Match[],
  lite: Map<string, PlayerLite>,
  mode: PairingMode,
  config: SessionConfig,
  history: DrawHistory
): number {
  const grade = (id: string) => lite.get(id)!.grade;
  const gender = (id: string) => lite.get(id)!.gender;
  let penalty = 0;

  for (const m of matches) {
    const avgA = avg(m.sideA.map(grade));
    const avgB = avg(m.sideB.map(grade));
    const gap = Math.abs(avgA - avgB);
    penalty += W_EVEN * Math.max(0, gap - config.evenTolerance) ** 2;
    penalty += W_EVEN_SOFT * gap;

    // avoid all-men vs all-women (doubles only)
    if (m.sideA.length === 2 && m.sideB.length === 2) {
      const allMenA = m.sideA.every((p) => gender(p) === 'M');
      const allWomenA = m.sideA.every((p) => gender(p) === 'F');
      const allMenB = m.sideB.every((p) => gender(p) === 'M');
      const allWomenB = m.sideB.every((p) => gender(p) === 'F');
      if ((allMenA && allWomenB) || (allWomenA && allMenB)) penalty += W_GENDER;
    }

    for (const side of [m.sideA, m.sideB]) {
      if (side.length === 2) {
        const partnerGap = Math.abs(grade(side[0]) - grade(side[1]));
        if (mode === 'balanced') {
          penalty += W_MODE_BALANCED * Math.max(0, partnerGap - config.balancedPartnerGap);
        } else {
          penalty -= W_MODE_MIXED * partnerGap; // reward spread
        }
        penalty += W_PARTNER * (history.partnerCount.get(pairKey(side[0], side[1])) ?? 0);
      }
    }

    for (const a of m.sideA)
      for (const b of m.sideB) penalty += W_OPPONENT * (history.opponentCount.get(pairKey(a, b)) ?? 0);
  }

  return penalty;
}

function totalSlots(formats: MatchFormat[]): number {
  return formats.reduce((s, f) => s + (f === 'doubles' ? 4 : f === 'singles' ? 2 : 3), 0);
}

/** Hill-climb from a seed ordering of the playing players. */
function optimise(
  seed: PlayerLite[],
  formats: MatchFormat[],
  lite: Map<string, PlayerLite>,
  mode: PairingMode,
  config: SessionConfig,
  history: DrawHistory,
  iterations: number
): { matches: Match[]; score: number } {
  let current = seed.slice();
  let currentScore = scoreMatches(slotsToMatches(current, formats), lite, mode, config, history);

  for (let it = 0; it < iterations; it++) {
    const i = Math.floor(Math.random() * current.length);
    let j = Math.floor(Math.random() * current.length);
    if (i === j) j = (j + 1) % current.length;
    const next = current.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const nextScore = scoreMatches(slotsToMatches(next, formats), lite, mode, config, history);
    if (nextScore <= currentScore) {
      current = next;
      currentScore = nextScore;
    }
  }

  return { matches: slotsToMatches(current, formats), score: currentScore };
}

export interface GenerateInput {
  active: PlayerLite[];
  mode: PairingMode;
  config: SessionConfig;
  history: DrawHistory;
  index: number;
}

/** Generate one round: select byes, then optimise the match assignment. */
export function generateRound({ active, mode, config, history, index }: GenerateInput): Round {
  const plan = planRound(active.length, config.courtCount);
  const byes = selectByes(active, plan.byeCount, history);
  const byeSet = new Set(byes);
  const playing = active.filter((p) => !byeSet.has(p.id));
  const lite = new Map(active.map((p) => [p.id, p] as const));

  if (totalSlots(plan.formats) !== playing.length || playing.length === 0) {
    return { index, pairingMode: mode, matches: [], byes, locked: false };
  }

  const sorted = playing.slice().sort((a, b) => a.grade - b.grade);
  const seeds: PlayerLite[][] = [sorted, shuffle(playing), shuffle(playing)];

  let best: { matches: Match[]; score: number } | null = null;
  for (const seed of seeds) {
    const result = optimise(seed, plan.formats, lite, mode, config, history, 1200);
    if (!best || result.score < best.score) best = result;
  }

  return { index, pairingMode: mode, matches: best!.matches, byes, locked: false };
}

/** Match evenness gap (average-grade difference) for display. */
export function matchGap(match: Match, grade: (id: string) => number): number {
  const a = avg(match.sideA.map(grade));
  const b = avg(match.sideB.map(grade));
  return Math.abs(a - b);
}

export function isMenVsWomen(match: Match, gender: (id: string) => 'M' | 'F'): boolean {
  if (match.sideA.length !== 2 || match.sideB.length !== 2) return false;
  const allMenA = match.sideA.every((p) => gender(p) === 'M');
  const allWomenA = match.sideA.every((p) => gender(p) === 'F');
  const allMenB = match.sideB.every((p) => gender(p) === 'M');
  const allWomenB = match.sideB.every((p) => gender(p) === 'F');
  return (allMenA && allWomenB) || (allWomenA && allMenB);
}
