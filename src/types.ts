export type Gender = 'M' | 'F';

/** A known person in the persistent Player Directory. */
export interface Player {
  id: string;
  name: string;
  /** Tennis Seniors division 2–12, lower = stronger. Used directly for matching. */
  grade: number;
  /** World Tennis Number, 40.0–1.0, lower = stronger. Reference only — the draw uses grade. */
  wtn?: number;
  gender: Gender;
  phone?: string;
  club?: string;
  notes?: string;
  /** Id from the club system this player was imported from, if any. */
  extId?: string;
  /** Grade was defaulted on import and has not been confirmed yet. */
  needsGrade?: boolean;
  /** Gender was defaulted on import and has not been confirmed yet. */
  needsGender?: boolean;
  /** WTN was defaulted because the portal had no match, and is not confirmed. */
  needsWtn?: boolean;
}

/** A player as captured into a Session — a snapshot taken when added. */
export interface SessionPlayer {
  playerId: string;
  name: string;
  grade: number;
  /** Snapshot of the directory WTN, editable per session like grade. */
  wtn?: number;
  gender: Gender;
  phone?: string;
}

export type PairingMode = 'balanced' | 'mixed';

/** Preferred gender composition of each Pair for a round. */
export type GenderMode = 'same' | 'mixed';

/**
 * Which number the draw balances on. Both scales run low = stronger, so the
 * comparisons are identical — only the spread differs (grade 1–12, WTN 1–40),
 * which is why each carries its own tolerances in SessionConfig.
 */
export type RatingMode = 'grade' | 'wtn';

export type MatchFormat = 'doubles' | 'singles' | 'uneven';

/** Two sides on one court for one round. Sides hold player ids. */
export interface Match {
  court: number;
  format: MatchFormat;
  sideA: string[];
  sideB: string[];
}

/**
 * Everything the draw needs to know about how one round is built. All of it is
 * chosen per round: two rounds of the same session can use different scales and
 * different tolerances. Use `roundSettings()` to read these off a stored Round —
 * older rounds are missing the newer fields.
 */
export interface RoundSettings {
  /** Courts available to this round — seeded from the session, overridable per round. */
  courtCount: number;
  pairingMode: PairingMode;
  /** Preferred gender composition of Pairs. */
  genderMode: GenderMode;
  /** Number the draw balances on. */
  ratingMode: RatingMode;
  /** Max average-rating difference between two sides still considered "even". */
  evenTolerance: number;
  /** Balanced mode only: max rating gap allowed between partners. */
  partnerGap: number;
}

export interface Round {
  index: number;
  /** Courts this round was drawn on (defaults to the session's courtCount for legacy rounds). */
  courtCount?: number;
  pairingMode: PairingMode;
  /** Preferred gender composition of Pairs (defaults to 'same' for legacy rounds). */
  genderMode: GenderMode;
  /** Number the draw balanced on (defaults to 'grade' for legacy rounds). */
  ratingMode: RatingMode;
  /**
   * Tolerances this round was drawn with, on this round's own rating scale.
   * Undefined on rounds saved before tolerances became per-round — those read
   * the session defaults for their scale instead.
   */
  evenTolerance?: number;
  partnerGap?: number;
  matches: Match[];
  byes: string[];
  /** Locked rounds are treated as fixed history and not regenerated. */
  locked: boolean;
}

export interface SessionConfig {
  /** Courts a new round starts with — each round then carries its own copy. */
  courtCount: number;
  /** Total rounds to print (including ungenerated placeholder rounds). */
  totalRounds: number;
  /**
   * Starting tolerances for a new round — each round then carries its own copy,
   * so editing these only affects rounds generated afterwards.
   */
  evenTolerance: number;
  balancedPartnerGap: number;
  /** Same two defaults on the WTN scale, which is roughly 2× as wide as grade. */
  wtnEvenTolerance: number;
  wtnBalancedPartnerGap: number;
}

export interface Session {
  id: string;
  name: string;
  date: string;
  config: SessionConfig;
  /** Roster snapshots for everyone who has been added to the session. */
  players: SessionPlayer[];
  /** Subset of player ids currently present (active roster for the next round). */
  activePlayerIds: string[];
  rounds: Round[];
}

export const DEFAULT_CONFIG: SessionConfig = {
  courtCount: 5,
  totalRounds: 6,
  evenTolerance: 1.5,
  balancedPartnerGap: 2,
  wtnEvenTolerance: 2.5,
  wtnBalancedPartnerGap: 3.5
};

export const GRADE_MIN = 1;
export const GRADE_MAX = 12;

export const WTN_MIN = 1;
export const WTN_MAX = 40;
/** Stand-in when a player has no WTN — the portal had no match for them. */
export const WTN_DEFAULT = 30;
