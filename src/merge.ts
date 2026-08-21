import type { Player, Round, Session, SessionPlayer } from './types';
import { normName, phoneDigits } from './util';

/** The fields a merge has to reconcile. The surviving entry keeps its own id. */
export type MergeField = 'name' | 'grade' | 'wtn' | 'gender' | 'phone' | 'club' | 'notes' | 'extId';

/** Which side a field takes its value from. Free text can keep both. */
export type MergeChoice = 'a' | 'b' | 'both';

/**
 * What a side's value is worth: nothing at all, a value that was defaulted on
 * import and never confirmed, or a real one. A higher rank wins outright — that
 * covers "one entry has it and the other does not", and it also lets a confirmed
 * grade beat a placeholder grade without anyone being asked.
 */
type Rank = 0 | 1 | 2;

type Value = string | number | undefined;

interface FieldSpec {
  label: string;
  value: (p: Player) => Value;
  rank: (p: Player) => Rank;
  /** Values that compare equal are not a conflict, however they are spelled. */
  same: (a: string | number, b: string | number) => boolean;
  display: (v: Value) => string;
  /** Losing free text is destructive, so those fields can keep both sides. */
  canKeepBoth?: boolean;
}

const filled = (v: Value): Rank => (String(v ?? '').trim() ? 2 : 0);
const sameText = (a: string | number, b: string | number) =>
  String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const showText = (v: Value) => String(v ?? '').trim() || '—';

const SPECS: Record<MergeField, FieldSpec> = {
  name: {
    label: 'Name',
    value: (p) => p.name,
    rank: (p) => filled(p.name),
    same: (a, b) => normName(String(a)) === normName(String(b)),
    display: showText
  },
  grade: {
    label: 'Grade',
    value: (p) => p.grade,
    rank: (p) => (p.needsGrade ? 1 : 2),
    same: (a, b) => a === b,
    display: (v) => (v === undefined ? '—' : `D${v}`)
  },
  wtn: {
    label: 'WTN',
    value: (p) => p.wtn,
    rank: (p) => (p.wtn === undefined ? 0 : p.needsWtn ? 1 : 2),
    same: (a, b) => a === b,
    display: (v) => (v === undefined ? '—' : Number(v).toFixed(1))
  },
  gender: {
    label: 'Gender',
    value: (p) => p.gender,
    rank: (p) => (p.needsGender ? 1 : 2),
    same: (a, b) => a === b,
    display: (v) => (v === 'M' ? 'Male' : v === 'F' ? 'Female' : '—')
  },
  phone: {
    label: 'Phone',
    value: (p) => p.phone,
    rank: (p) => filled(p.phone),
    // The same number written with different punctuation is the same number.
    same: (a, b) => phoneDigits(String(a)) === phoneDigits(String(b)),
    display: showText
  },
  club: {
    label: 'Club',
    value: (p) => p.club,
    rank: (p) => filled(p.club),
    same: sameText,
    display: showText
  },
  notes: {
    label: 'Notes',
    value: (p) => p.notes,
    rank: (p) => filled(p.notes),
    same: sameText,
    display: showText,
    canKeepBoth: true
  },
  extId: {
    label: 'Club id',
    value: (p) => p.extId,
    rank: (p) => filled(p.extId),
    same: sameText,
    display: showText
  }
};

const MERGE_FIELDS = Object.keys(SPECS) as MergeField[];

export interface FieldPlan {
  field: MergeField;
  label: string;
  /** Both sides, as they should be shown. */
  a: string;
  b: string;
  /** The side the value comes from, or null when the organiser has to choose. */
  auto: 'a' | 'b' | null;
  conflict: boolean;
  canKeepBoth: boolean;
}

/**
 * Work out, field by field, what merging `b` into `a` would do. Fields neither
 * entry has are left out — there is nothing to show or decide about them.
 */
export function planMerge(a: Player, b: Player): FieldPlan[] {
  const plans: FieldPlan[] = [];
  for (const field of MERGE_FIELDS) {
    const spec = SPECS[field];
    const rankA = spec.rank(a);
    const rankB = spec.rank(b);
    if (rankA === 0 && rankB === 0) continue;
    const valueA = spec.value(a);
    const valueB = spec.value(b);

    let auto: 'a' | 'b' | null = null;
    if (rankA > rankB) auto = 'a';
    else if (rankB > rankA) auto = 'b';
    else if (valueA !== undefined && valueB !== undefined && spec.same(valueA, valueB)) auto = 'a';

    plans.push({
      field,
      label: spec.label,
      a: spec.display(valueA),
      b: spec.display(valueB),
      auto,
      conflict: auto === null,
      canKeepBoth: !!spec.canKeepBoth
    });
  }
  return plans;
}

/**
 * Build the surviving entry. `a` is the one being kept, so it keeps its id and
 * is the default side for any conflict left unresolved.
 */
export function applyMerge(
  a: Player,
  b: Player,
  choices: Partial<Record<MergeField, MergeChoice>>
): Player {
  const plans = planMerge(a, b);
  const from = (field: MergeField): MergeChoice | null => {
    const plan = plans.find((x) => x.field === field);
    if (!plan) return null;
    return plan.conflict ? choices[field] ?? 'a' : plan.auto;
  };
  const side = (field: MergeField) => (from(field) === 'b' ? b : a);
  const joined = (field: MergeField, valueA?: string, valueB?: string) => {
    const parts = [valueA, valueB].map((s) => (s ?? '').trim());
    const chosen = from(field);
    if (chosen === 'both') return parts.filter(Boolean).join(' | ') || undefined;
    if (chosen === 'b') return parts[1] || undefined;
    if (chosen === 'a') return parts[0] || undefined;
    return undefined;
  };

  const gradeSide = side('grade');
  const genderSide = side('gender');
  const wtnSide = side('wtn');
  const wtn = from('wtn') === null ? undefined : wtnSide.wtn;

  return {
    id: a.id,
    name: (from('name') === 'b' ? b.name : a.name).trim(),
    grade: gradeSide.grade,
    wtn,
    gender: genderSide.gender,
    phone: joined('phone', a.phone, b.phone),
    club: joined('club', a.club, b.club),
    notes: joined('notes', a.notes, b.notes),
    extId: joined('extId', a.extId, b.extId),
    // The review flags follow the value: a placeholder stays flagged.
    needsGrade: gradeSide.needsGrade,
    needsGender: genderSide.needsGender,
    needsWtn: wtn === undefined ? undefined : wtnSide.needsWtn
  };
}

/**
 * Point every reference in one session from `fromId` at `toId`, returning the
 * session untouched when it never mentioned the removed entry. A session that
 * held both ends up with one: the second roster snapshot is dropped, and where
 * the two shared a round the second appearance goes rather than putting one
 * person on a court twice.
 */
export function remapSessionPlayer(session: Session, fromId: string, toId: string): Session {
  const usedInRound = (r: Round) =>
    r.byes.includes(fromId) ||
    r.matches.some((m) => m.sideA.includes(fromId) || m.sideB.includes(fromId));
  const touched =
    session.players.some((p) => p.playerId === fromId) ||
    session.activePlayerIds.includes(fromId) ||
    session.rounds.some(usedInRound);
  if (!touched) return session;

  // Snapshots keep their own grade and WTN: those are session-local edits, and
  // rewriting them would change what past rounds were drawn on.
  const players: SessionPlayer[] = [];
  const onRoster = new Set<string>();
  for (const p of session.players) {
    const playerId = p.playerId === fromId ? toId : p.playerId;
    if (onRoster.has(playerId)) continue;
    onRoster.add(playerId);
    players.push(playerId === p.playerId ? p : { ...p, playerId });
  }

  const activePlayerIds: string[] = [];
  for (const id of session.activePlayerIds) {
    const next = id === fromId ? toId : id;
    if (!activePlayerIds.includes(next)) activePlayerIds.push(next);
  }

  const rounds = session.rounds.map((round) => {
    if (!usedInRound(round)) return round;
    const placed = new Set<string>();
    const remap = (ids: string[]) => {
      const out: string[] = [];
      for (const id of ids) {
        const next = id === fromId ? toId : id;
        if (placed.has(next)) continue;
        placed.add(next);
        out.push(next);
      }
      return out;
    };
    const matches = round.matches.map((m) => ({ ...m, sideA: remap(m.sideA), sideB: remap(m.sideB) }));
    return { ...round, matches, byes: remap(round.byes) };
  });

  return { ...session, players, activePlayerIds, rounds };
}
