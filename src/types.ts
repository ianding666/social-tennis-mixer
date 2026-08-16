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
  gender: Gender;
  phone?: string;
}

export type PairingMode = 'balanced' | 'mixed';

/** Preferred gender composition of each Pair for a round. */
export type GenderMode = 'same' | 'mixed';

export type MatchFormat = 'doubles' | 'singles' | 'uneven';

/** Two sides on one court for one round. Sides hold player ids. */
export interface Match {
  court: number;
  format: MatchFormat;
  sideA: string[];
  sideB: string[];
}

export interface Round {
  index: number;
  pairingMode: PairingMode;
  /** Preferred gender composition of Pairs (defaults to 'same' for legacy rounds). */
  genderMode: GenderMode;
  matches: Match[];
  byes: string[];
  /** Locked rounds are treated as fixed history and not regenerated. */
  locked: boolean;
}

export interface SessionConfig {
  courtCount: number;
  /** Total rounds to print (including ungenerated placeholder rounds). */
  totalRounds: number;
  /** Max average-grade difference between two sides still considered "even". */
  evenTolerance: number;
  /** Balanced mode: max grade gap allowed between partners. */
  balancedPartnerGap: number;
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
  balancedPartnerGap: 2
};

export const GRADE_MIN = 1;
export const GRADE_MAX = 12;

export const WTN_MIN = 1;
export const WTN_MAX = 40;
