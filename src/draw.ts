import type { Match, MatchFormat, RatingMode, Round, RoundSettings, SessionConfig } from './types';
import { DEFAULT_CONFIG, WTN_DEFAULT } from './types';
import { shuffle } from './util';

export interface PlayerLite {
  id: string;
  grade: number;
  /** Only used when the round's RatingMode is 'wtn'. */
  wtn?: number;
  gender: 'M' | 'F';
}

/**
 * The number a round is balanced on. Grade and WTN both run low = stronger, so
 * every comparison below is unchanged between the two — only the scale differs.
 * A player with no WTN falls back to the placeholder rather than to their grade:
 * a grade of 10 read as a WTN would look like a near-elite player.
 */
export function ratingOf(p: PlayerLite, ratingMode: RatingMode): number {
  return ratingMode === 'wtn' ? p.wtn ?? WTN_DEFAULT : p.grade;
}

export interface Tolerances {
  evenTolerance: number;
  partnerGap: number;
}

/**
 * The session's starting tolerances for a scale — they are not interchangeable
 * between scales. Sessions saved before the WTN fields existed have them
 * undefined, and an undefined tolerance would turn every penalty into NaN, so
 * fall back here.
 */
export function ratingTolerances(config: SessionConfig, ratingMode: RatingMode): Tolerances {
  return ratingMode === 'wtn'
    ? {
        evenTolerance: config.wtnEvenTolerance ?? DEFAULT_CONFIG.wtnEvenTolerance,
        partnerGap: config.wtnBalancedPartnerGap ?? DEFAULT_CONFIG.wtnBalancedPartnerGap
      }
    : {
        evenTolerance: config.evenTolerance ?? DEFAULT_CONFIG.evenTolerance,
        partnerGap: config.balancedPartnerGap ?? DEFAULT_CONFIG.balancedPartnerGap
      };
}

/**
 * A stored round's settings, resolved for display and redraws. Each field a
 * round predates falls back to the session default for that round's scale.
 */
export function roundSettings(round: Round, config: SessionConfig): RoundSettings {
  const ratingMode = round.ratingMode ?? 'grade';
  const fallback = ratingTolerances(config, ratingMode);
  return {
    courtCount: round.courtCount ?? config.courtCount ?? DEFAULT_CONFIG.courtCount,
    pairingMode: round.pairingMode,
    genderMode: round.genderMode ?? 'same',
    ratingMode,
    evenTolerance: round.evenTolerance ?? fallback.evenTolerance,
    partnerGap: round.partnerGap ?? fallback.partnerGap
  };
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

function avg(ratings: number[]): number {
  return ratings.reduce((s, g) => s + g, 0) / ratings.length;
}

/** Turn an ordered slot array into matches, canonicalising odd formats by rating. */
function slotsToMatches(slots: PlayerLite[], formats: MatchFormat[], ratingMode: RatingMode): Match[] {
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
      // uneven: strongest (lowest rating) plays alone
      const g = slots
        .slice(i, i + 3)
        .sort((a, b) => ratingOf(a, ratingMode) - ratingOf(b, ratingMode));
      matches.push({ court: court + 1, format, sideA: [g[0].id], sideB: [g[1].id, g[2].id] });
      i += 3;
    }
  });
  return matches;
}

function scoreMatches(
  matches: Match[],
  lite: Map<string, PlayerLite>,
  settings: RoundSettings,
  history: DrawHistory
): number {
  const { pairingMode: mode, genderMode, ratingMode } = settings;
  const rating = (id: string) => ratingOf(lite.get(id)!, ratingMode);
  const gender = (id: string) => lite.get(id)!.gender;
  let penalty = 0;

  for (const m of matches) {
    const avgA = avg(m.sideA.map(rating));
    const avgB = avg(m.sideB.map(rating));
    const gap = Math.abs(avgA - avgB);
    penalty += W_EVEN * Math.max(0, gap - settings.evenTolerance) ** 2;
    penalty += W_EVEN_SOFT * gap;

    // Gender Mode: prefer the chosen composition of each Pair.
    for (const side of [m.sideA, m.sideB]) {
      if (side.length === 2) {
        const sameGenderPair = gender(side[0]) === gender(side[1]);
        const wantsSame = genderMode === 'same';
        if (sameGenderPair !== wantsSame) penalty += W_GENDER;
      }
    }

    // Same-gender mode: also keep MM vs MM / FF vs FF (avoid MM vs FF, doubles only).
    if (genderMode === 'same' && m.sideA.length === 2 && m.sideB.length === 2) {
      const allMenA = m.sideA.every((p) => gender(p) === 'M');
      const allWomenA = m.sideA.every((p) => gender(p) === 'F');
      const allMenB = m.sideB.every((p) => gender(p) === 'M');
      const allWomenB = m.sideB.every((p) => gender(p) === 'F');
      if ((allMenA && allWomenB) || (allWomenA && allMenB)) penalty += W_GENDER;
    }

    for (const side of [m.sideA, m.sideB]) {
      if (side.length === 2) {
        const partnerGap = Math.abs(rating(side[0]) - rating(side[1]));
        if (mode === 'balanced') {
          penalty += W_MODE_BALANCED * Math.max(0, partnerGap - settings.partnerGap);
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
  settings: RoundSettings,
  history: DrawHistory,
  iterations: number
): { matches: Match[]; score: number } {
  const score = (order: PlayerLite[]) =>
    scoreMatches(slotsToMatches(order, formats, settings.ratingMode), lite, settings, history);

  let current = seed.slice();
  let currentScore = score(current);

  for (let it = 0; it < iterations; it++) {
    const i = Math.floor(Math.random() * current.length);
    let j = Math.floor(Math.random() * current.length);
    if (i === j) j = (j + 1) % current.length;
    const next = current.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const nextScore = score(next);
    if (nextScore <= currentScore) {
      current = next;
      currentScore = nextScore;
    }
  }

  return { matches: slotsToMatches(current, formats, settings.ratingMode), score: currentScore };
}

export interface GenerateInput {
  active: PlayerLite[];
  /** Includes the court count this round is drawn on. */
  settings: RoundSettings;
  history: DrawHistory;
  index: number;
}

/** Generate one round: select byes, then optimise the match assignment. */
export function generateRound({ active, settings, history, index }: GenerateInput): Round {
  const plan = planRound(active.length, settings.courtCount);
  const byes = selectByes(active, plan.byeCount, history);
  const byeSet = new Set(byes);
  const playing = active.filter((p) => !byeSet.has(p.id));
  const lite = new Map(active.map((p) => [p.id, p] as const));
  // The settings are stamped onto the round so it stays readable — and
  // redrawable — even after the session defaults or a later round change.
  const base = { index, ...settings, byes, locked: false };

  if (totalSlots(plan.formats) !== playing.length || playing.length === 0) {
    return { ...base, matches: [] };
  }

  const ratingMode = settings.ratingMode;
  const sorted = playing.slice().sort((a, b) => ratingOf(a, ratingMode) - ratingOf(b, ratingMode));
  const seeds: PlayerLite[][] = [sorted, shuffle(playing), shuffle(playing)];

  let best: { matches: Match[]; score: number } | null = null;
  for (const seed of seeds) {
    const result = optimise(seed, plan.formats, lite, settings, history, 1200);
    if (!best || result.score < best.score) best = result;
  }

  return { ...base, matches: best!.matches };
}

/** Match evenness gap (difference of side averages) for display. */
export function matchGap(match: Match, rating: (id: string) => number): number {
  const a = avg(match.sideA.map(rating));
  const b = avg(match.sideB.map(rating));
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
