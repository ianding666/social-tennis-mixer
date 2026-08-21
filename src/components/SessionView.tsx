import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gender, GenderMode, Match, MatchFormat, PairingMode, Player, RatingMode, Round, RoundSettings, Session, SessionPlayer } from '../types';
import { GRADE_MAX, GRADE_MIN, WTN_DEFAULT, WTN_MAX, WTN_MIN } from '../types';
import {
  deriveHistory,
  generateRound,
  isMenVsWomen,
  matchGap,
  planRound,
  ratingTolerances,
  roundSettings,
  type PlayerLite
} from '../draw';
import { uid } from '../util';
import CountInput from './CountInput';

/**
 * Print layout: courts go two to a row, ten to a sheet. A round with more prints
 * across as many sheets as it needs, ten courts at a time.
 */
const PRINT_COLUMNS = 2;
const MAX_PRINT_COURTS = 10;
const PRINT_ROWS_PER_PAGE = MAX_PRINT_COURTS / PRINT_COLUMNS;

interface Props {
  session: Session;
  players: Player[];
  onChange: (s: Session) => void;
  onAddPlayerToDirectory: (p: Player) => void;
}

function InfoIcon() {
  return (
    <svg
      className="hint-mark"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

interface FieldProps {
  label: string;
  /** Explanation behind an info mark next to the label, opened by clicking it. */
  hint?: string;
  children: React.ReactNode;
}

/** Widest a hint bubble gets, matching .hint-bubble — used to decide which way it opens. */
const HINT_WIDTH = 240;

/** One labelled control in a settings bar. */
function Field({ label, hint, children }: FieldProps) {
  const [open, setOpen] = useState(false);
  /** Near the right edge the bubble opens leftwards instead, to stay on screen. */
  const [flip, setFlip] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    // Without this the wrapping <label> hands the click on to its control.
    e.preventDefault();
    e.stopPropagation();
    const rect = anchor.current?.getBoundingClientRect();
    if (rect) setFlip(rect.left + HINT_WIDTH > window.innerWidth - 8);
    setOpen((v) => !v);
  };

  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && (
          <span className="hint" ref={anchor}>
            <button
              type="button"
              className="hint-btn"
              aria-expanded={open}
              aria-label={`About ${label}`}
              onClick={toggle}
            >
              <InfoIcon />
            </button>
            {open && (
              <span className={flip ? 'hint-bubble flip' : 'hint-bubble'} role="tooltip">
                {hint}
              </span>
            )}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

interface SettingsFieldsProps {
  value: RoundSettings;
  /** Locked rounds show their settings but cannot be edited. */
  disabled?: boolean;
  onChange: (patch: Partial<RoundSettings>) => void;
}

/**
 * The six draw settings of one round, shared by the next-round bar and every
 * generated round so both read the same way.
 */
function SettingsFields({ value, disabled, onChange }: SettingsFieldsProps) {
  const wtn = value.ratingMode === 'wtn';
  const unit = wtn ? 'WTN' : 'grade';
  const num = (raw: string) => Math.max(0, Number(raw) || 0);
  return (
    <>
      <Field label="Courts">
        <CountInput
          value={value.courtCount}
          disabled={disabled}
          onChange={(courtCount) => onChange({ courtCount })}
        />
      </Field>

      <Field label="Gender">
        <select
          disabled={disabled}
          value={value.genderMode}
          onChange={(e) => onChange({ genderMode: e.target.value as GenderMode })}
        >
          <option value="same">Same gender</option>
          <option value="mixed">Mixed gender</option>
        </select>
      </Field>

      <Field label="Pairing">
        <select
          disabled={disabled}
          value={value.pairingMode}
          onChange={(e) => onChange({ pairingMode: e.target.value as PairingMode })}
        >
          <option value="balanced">Balanced — similar</option>
          <option value="mixed">Mixed — strong + weak</option>
        </select>
      </Field>

      <Field label="Rate by">
        <select
          disabled={disabled}
          value={value.ratingMode}
          onChange={(e) => onChange({ ratingMode: e.target.value as RatingMode })}
        >
          <option value="grade">Grade (D1–D12)</option>
          <option value="wtn">WTN (1–40)</option>
        </select>
      </Field>

      <Field
        label={`Even Δ ≤ (${unit})`}
        hint="Largest allowed difference between the two sides' averages for a match to count as “even”. Lower = stricter (tighter matches); higher = more flexible. Each court shows Δ in green when within this."
      >
        <input
          type="number"
          step={0.5}
          min={0}
          max={wtn ? 15 : 6}
          disabled={disabled}
          value={value.evenTolerance}
          onChange={(e) => onChange({ evenTolerance: num(e.target.value) })}
        />
      </Field>

      {/* Only Balanced pairing uses a partner gap; Mixed ignores it, so it is */}
      {/* hidden rather than shown as a control that does nothing. The stored */}
      {/* number is untouched and comes back when Balanced is picked again. */}
      {value.pairingMode === 'balanced' && (
        <Field
          label={`Partner gap ≤ (${unit})`}
          hint="Largest gap allowed between two partners on the same side. Lower = partners must be closer."
        >
          <input
            type="number"
            step={wtn ? 0.5 : 1}
            min={0}
            max={wtn ? 20 : 10}
            disabled={disabled}
            value={value.partnerGap}
            onChange={(e) => onChange({ partnerGap: num(e.target.value) })}
          />
        </Field>
      )}
    </>
  );
}

function swapInRound(round: Round, a: string, b: string): Round {
  const swap = (id: string) => (id === a ? b : id === b ? a : id);
  return {
    ...round,
    matches: round.matches.map((m) => ({
      ...m,
      sideA: m.sideA.map(swap),
      sideB: m.sideB.map(swap)
    })),
    byes: round.byes.map(swap)
  };
}

/** Pull a player out of a round: they sit out (move to byes) and their court's format is recomputed. */
function removeFromRound(round: Round, id: string): Round {
  const byes = round.byes.filter((b) => b !== id);
  const matches: Match[] = [];
  for (const m of round.matches) {
    if (!m.sideA.includes(id) && !m.sideB.includes(id)) {
      matches.push(m);
      continue;
    }
    const sideA = m.sideA.filter((x) => x !== id);
    const sideB = m.sideB.filter((x) => x !== id);
    // A side with no players has no opponent — dissolve the court, remaining players sit out too.
    if (sideA.length === 0 || sideB.length === 0) {
      byes.push(...sideA, ...sideB);
      continue;
    }
    const format: MatchFormat =
      sideA.length !== sideB.length ? 'uneven' : sideA.length === 1 ? 'singles' : 'doubles';
    matches.push({ ...m, sideA, sideB, format });
  }
  return { ...round, matches, byes };
}

/** Place a bye player onto a court side (max 2 per side) and recompute that court's format. */
function addToSide(round: Round, id: string, court: number, side: 'A' | 'B'): Round {
  const target = round.matches.find((m) => m.court === court);
  if (!target) return round;
  const targetSide = side === 'A' ? target.sideA : target.sideB;
  if (targetSide.length >= 2) return round;
  const byes = round.byes.filter((b) => b !== id);
  const matches = round.matches.map((m) => {
    if (m.court !== court) return m;
    const sideA = side === 'A' ? [...m.sideA, id] : m.sideA;
    const sideB = side === 'B' ? [...m.sideB, id] : m.sideB;
    const format: MatchFormat =
      sideA.length !== sideB.length ? 'uneven' : sideA.length === 1 ? 'singles' : 'doubles';
    return { ...m, sideA, sideB, format };
  });
  return { ...round, matches, byes };
}

/** Add players to the latest (unlocked) round's bye list, skipping anyone already in that round. */
function addToLatestRoundByes(rounds: Round[], ids: string[]): Round[] {
  if (rounds.length === 0) return rounds;
  const i = rounds.length - 1;
  const last = rounds[i];
  if (last.locked) return rounds;
  const inRound = new Set<string>([
    ...last.byes,
    ...last.matches.flatMap((m) => [...m.sideA, ...m.sideB])
  ]);
  const toAdd = ids.filter((id) => !inRound.has(id));
  if (toAdd.length === 0) return rounds;
  return rounds.map((r, idx) => (idx === i ? { ...r, byes: [...r.byes, ...toAdd] } : r));
}

export default function SessionView({ session, players, onChange, onAddPlayerToDirectory }: Props) {
  const [search, setSearch] = useState('');
  const [nextMode, setNextMode] = useState<PairingMode>('balanced');
  const [nextGenderMode, setNextGenderMode] = useState<GenderMode>('same');
  // WTN is the finer scale, so it is the default to draw on; a round falls back
  // to grade only when a player has no WTN, or when the organiser picks grade.
  const [nextRatingMode, setNextRatingMode] = useState<RatingMode>('wtn');
  const [selected, setSelected] = useState<{ round: number; id: string } | null>(null);
  const [walkin, setWalkin] = useState({ name: '', grade: '6', gender: 'M' as Gender, phone: '' });
  // The round whose Print button was pressed. Printing is per round: the class
  // this puts on the page hides every other card, so one round fills one sheet.
  const [printIndex, setPrintIndex] = useState<number | null>(null);

  useEffect(() => {
    if (printIndex === null) return;
    // Runs after the class has landed on the DOM, so the dialog sees one round.
    window.print();
    setPrintIndex(null);
  }, [printIndex]);

  const playerById = useMemo(() => {
    const m = new Map<string, SessionPlayer>();
    for (const p of session.players) m.set(p.playerId, p);
    return m;
  }, [session.players]);

  const gender = (id: string) => (playerById.get(id)?.gender ?? 'M') as Gender;
  const name = (id: string) => playerById.get(id)?.name ?? '?';

  /** The number a round was drawn on, for that round's own rating mode. */
  const ratingFor = (mode: RatingMode) => (id: string) => {
    const p = playerById.get(id);
    if (!p) return 0;
    return mode === 'wtn' ? p.wtn ?? WTN_DEFAULT : p.grade;
  };

  const activeSet = useMemo(() => new Set(session.activePlayerIds), [session.activePlayerIds]);
  const activeLite: PlayerLite[] = session.players
    .filter((p) => activeSet.has(p.playerId))
    .map((p) => ({ id: p.playerId, grade: p.grade, wtn: p.wtn, gender: p.gender }));

  /** Present players the WTN draw would have to guess a number for. */
  const missingWtn = activeLite.filter((p) => p.wtn === undefined).length;

  // Settings the next round will be generated with. The tolerances live on the
  // session so they carry over as the starting point for each new round; the
  // fallback keeps sessions saved before the WTN fields on controlled inputs.
  const nextSettings: RoundSettings = {
    courtCount: session.config.courtCount,
    pairingMode: nextMode,
    genderMode: nextGenderMode,
    ratingMode: nextRatingMode,
    ...ratingTolerances(session.config, nextRatingMode)
  };

  const playedCount = useMemo(() => deriveHistory(session.rounds).playedCount, [session.rounds]);

  const directoryResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const inSession = new Set(session.players.map((p) => p.playerId));
    return players
      .filter((p) => !inSession.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [players, search, session.players]);

  const update = (patch: Partial<Session>) => onChange({ ...session, ...patch });

  const addFromDirectory = (p: Player) => {
    const sp: SessionPlayer = { playerId: p.id, name: p.name, grade: p.grade, wtn: p.wtn, gender: p.gender, phone: p.phone };
    update({
      players: [...session.players, sp],
      activePlayerIds: [...session.activePlayerIds, p.id],
      rounds: addToLatestRoundByes(session.rounds, [p.id])
    });
  };

  const addWalkin = () => {
    const nm = walkin.name.trim();
    const g = Number(walkin.grade);
    if (!nm) return alert('Name required.');
    if (!Number.isFinite(g) || g < GRADE_MIN || g > GRADE_MAX) return alert(`Grade D${GRADE_MIN}–D${GRADE_MAX}.`);
    const player: Player = { id: uid(), name: nm, grade: g, gender: walkin.gender, phone: walkin.phone.trim() };
    onAddPlayerToDirectory(player);
    const sp: SessionPlayer = { playerId: player.id, name: player.name, grade: player.grade, gender: player.gender, phone: player.phone };
    update({
      players: [...session.players, sp],
      activePlayerIds: [...session.activePlayerIds, player.id],
      rounds: addToLatestRoundByes(session.rounds, [player.id])
    });
    setWalkin({ name: '', grade: '6', gender: 'M', phone: '' });
  };

  const togglePresent = (id: string) => {
    if (activeSet.has(id)) {
      update({ activePlayerIds: session.activePlayerIds.filter((x) => x !== id) });
    } else {
      update({
        activePlayerIds: [...session.activePlayerIds, id],
        rounds: addToLatestRoundByes(session.rounds, [id])
      });
    }
  };

  const removeFromSession = (id: string) => {
    update({
      players: session.players.filter((p) => p.playerId !== id),
      activePlayerIds: session.activePlayerIds.filter((x) => x !== id)
    });
  };

  const setSessionGrade = (id: string, value: number) => {
    update({
      players: session.players.map((p) => (p.playerId === id ? { ...p, grade: value } : p))
    });
  };

  /** Session-local edit, like grade — it does not write back to the directory. */
  const setSessionWtn = (id: string, raw: string) => {
    const value = raw.trim() ? Number(raw) : undefined;
    if (value !== undefined && (!Number.isFinite(value) || value < WTN_MIN || value > WTN_MAX)) return;
    update({
      players: session.players.map((p) => (p.playerId === id ? { ...p, wtn: value } : p))
    });
  };

  const setConfig = (patch: Partial<Session['config']>) =>
    update({ config: { ...session.config, ...patch } });

  /**
   * Edit the next round's settings. Court count and the tolerances live on the
   * session — the round stamps its own copy when it is generated, so changing
   * them here only moves the starting point for rounds drawn afterwards.
   */
  const setNextSettings = (patch: Partial<RoundSettings>) => {
    if (patch.courtCount !== undefined) setConfig({ courtCount: patch.courtCount });
    if (patch.pairingMode) setNextMode(patch.pairingMode);
    if (patch.genderMode) setNextGenderMode(patch.genderMode);
    if (patch.ratingMode) setNextRatingMode(patch.ratingMode);
    const wtn = nextRatingMode === 'wtn';
    if (patch.evenTolerance !== undefined)
      setConfig(wtn ? { wtnEvenTolerance: patch.evenTolerance } : { evenTolerance: patch.evenTolerance });
    if (patch.partnerGap !== undefined)
      setConfig(wtn ? { wtnBalancedPartnerGap: patch.partnerGap } : { balancedPartnerGap: patch.partnerGap });
  };

  const generateNext = () => {
    if (activeLite.length < 2) return alert('Mark at least 2 players present.');
    const round = generateRound({
      active: activeLite,
      settings: nextSettings,
      history: deriveHistory(session.rounds),
      index: session.rounds.length
    });
    update({ rounds: [...session.rounds, round] });
  };

  /**
   * Edit one round's settings. Tolerances are scale-specific, so switching a
   * round's rating mode reseeds them from the session defaults for that scale
   * rather than carrying a grade number over to WTN.
   */
  const setRoundSettings = (i: number, patch: Partial<RoundSettings>) => {
    const full = patch.ratingMode
      ? { ...patch, ...ratingTolerances(session.config, patch.ratingMode) }
      : patch;
    update({ rounds: session.rounds.map((r, idx) => (idx === i ? { ...r, ...full } : r)) });
  };

  /** Redraw one round from the history of the rounds before it. */
  const regenerateRound = (i: number) => {
    const target = session.rounds[i];
    if (!target || target.locked) return;
    if (activeLite.length < 2) return alert('Mark at least 2 players present.');
    const round = generateRound({
      active: activeLite,
      // The round's own court count and tolerances — not the session defaults.
      settings: roundSettings(target, session.config),
      history: deriveHistory(session.rounds.slice(0, i)),
      index: i
    });
    update({ rounds: session.rounds.map((r, idx) => (idx === i ? round : r)) });
    setSelected(null);
  };

  /** Deleting a round shifts the later ones up, so their index — the printed round number — is rewritten. */
  const deleteRound = (i: number) => {
    update({
      rounds: session.rounds.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, index: idx }))
    });
    setSelected(null);
  };

  const toggleLock = (i: number) => {
    update({
      rounds: session.rounds.map((r, idx) => (idx === i ? { ...r, locked: !r.locked } : r))
    });
  };

  const onChipClick = (roundIndex: number, id: string, locked: boolean) => {
    if (locked) return;
    if (!selected || selected.round !== roundIndex) {
      setSelected({ round: roundIndex, id });
      return;
    }
    if (selected.id === id) {
      setSelected(null);
      return;
    }
    const newRound = swapInRound(session.rounds[roundIndex], selected.id, id);
    update({ rounds: session.rounds.map((r, idx) => (idx === roundIndex ? newRound : r)) });
    setSelected(null);
  };

  const onRemoveFromRound = (roundIndex: number, id: string) => {
    const newRound = removeFromRound(session.rounds[roundIndex], id);
    update({ rounds: session.rounds.map((r, idx) => (idx === roundIndex ? newRound : r)) });
    if (selected?.round === roundIndex && selected.id === id) setSelected(null);
  };

  const onAddToSide = (roundIndex: number, id: string, court: number, side: 'A' | 'B') => {
    const newRound = addToSide(session.rounds[roundIndex], id, court, side);
    update({ rounds: session.rounds.map((r, idx) => (idx === roundIndex ? newRound : r)) });
    setSelected(null);
  };

  const plan = planRound(activeLite.length, nextSettings.courtCount);

  // The search box does double duty: it looks people up in the directory to add
  // them, and narrows the roster below to the players already added.
  const sortedRoster = useMemo(() => {
    const list = session.players.slice().sort((a, b) => a.name.localeCompare(b.name));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q)
    );
  }, [session.players, search]);

  return (
    <div className={printIndex === null ? undefined : 'print-one'}>
      <div className="card no-print">
        <h3>
          Roster — {activeLite.length} present of {session.players.length}
          {search.trim() && ` — showing ${sortedRoster.length} matching`}
        </h3>
        <div className="row">
          <input
            className="grow"
            placeholder="Search name or phone — filters the roster, or add from directory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {directoryResults.length > 0 && (
          <div style={{ marginTop: '0.4rem' }}>
            {directoryResults.map((p) => (
              <button key={p.id} className="chip" onClick={() => addFromDirectory(p)}>
                <span className="nm">{p.name}</span>
                <span className="badge grade">D{p.grade}</span>
                <span className={`badge ${p.gender.toLowerCase()}`}>{p.gender}</span>
                <span className="muted small">{p.phone}</span>
                <span>＋</span>
              </button>
            ))}
          </div>
        )}

        <details style={{ marginTop: '0.6rem' }}>
          <summary className="small">Add a walk-in (new person)</summary>
          <div className="row" style={{ marginTop: '0.4rem' }}>
            <input
              placeholder="Name"
              value={walkin.name}
              onChange={(e) => setWalkin({ ...walkin, name: e.target.value })}
            />
            <select
              value={walkin.grade}
              onChange={(e) => setWalkin({ ...walkin, grade: e.target.value })}
            >
              {Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i).map((g) => (
                <option key={g} value={String(g)}>D{g}</option>
              ))}
            </select>
            <select
              value={walkin.gender}
              onChange={(e) => setWalkin({ ...walkin, gender: e.target.value as Gender })}
            >
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            <input
              placeholder="Phone"
              value={walkin.phone}
              onChange={(e) => setWalkin({ ...walkin, phone: e.target.value })}
            />
            <button onClick={addWalkin}>Add walk-in</button>
          </div>
        </details>

        {session.players.length > 0 && sortedRoster.length === 0 && (
          <p className="small muted" style={{ marginTop: '0.6rem' }}>
            No added player matches “{search.trim()}”.
          </p>
        )}
        {sortedRoster.length > 0 && (
          <div className="scroll-list" style={{ marginTop: '0.6rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Present</th>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>WTN</th>
                  <th>Gender</th>
                  <th>Played</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedRoster.map((p) => (
                  <tr key={p.playerId} style={{ opacity: activeSet.has(p.playerId) ? 1 : 0.5 }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={activeSet.has(p.playerId)}
                        onChange={() => togglePresent(p.playerId)}
                      />
                    </td>
                    <td>{p.name}</td>
                    <td>
                      <input
                        type="number"
                        min={GRADE_MIN}
                        max={GRADE_MAX}
                        style={{ width: 60 }}
                        value={p.grade}
                        onChange={(e) => setSessionGrade(p.playerId, Number(e.target.value) || p.grade)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        min={WTN_MIN}
                        max={WTN_MAX}
                        style={{ width: 76 }}
                        placeholder="—"
                        value={p.wtn ?? ''}
                        onChange={(e) => setSessionWtn(p.playerId, e.target.value)}
                      />
                    </td>
                    <td>
                      <span className={`badge ${p.gender.toLowerCase()}`}>{p.gender === 'M' ? 'Male' : 'Female'}</span>
                    </td>
                    <td>{playedCount.get(p.playerId) ?? 0}</td>
                    <td>
                      <button className="ghost danger" onClick={() => removeFromSession(p.playerId)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card no-print">
        <h3>
          Next round — round {session.rounds.length + 1}
          {session.rounds.length < session.config.totalRounds && ` of ${session.config.totalRounds}`}
        </h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          {plan.formats.filter((f) => f === 'doubles').length} doubles
          {plan.formats.includes('singles') && ' + 1 singles'}
          {plan.formats.includes('uneven') && ' + 1 uneven (1v2)'}
          {plan.byeCount > 0 && `, ${plan.byeCount} bye${plan.byeCount > 1 ? 's' : ''}`} from{' '}
          {activeLite.length} present.
        </p>
        <div className="settings-bar">
          <SettingsFields value={nextSettings} onChange={setNextSettings} />
          <span className="grow" />
          <div className="bar-actions">
            <button className="primary" onClick={generateNext}>
              Generate round {session.rounds.length + 1}
            </button>
          </div>
        </div>
        {nextRatingMode === 'wtn' && missingWtn > 0 && (
          <p className="small errors" style={{ marginBottom: 0 }}>
            ⚠ {missingWtn} of {activeLite.length} present player{missingWtn === 1 ? ' has' : 's have'} no
            WTN — they will be drawn as {WTN_DEFAULT.toFixed(1)}. Sync WTN in the directory, or set a
            number in the roster above.
          </p>
        )}
      </div>

      {session.rounds.length === 0 ? (
        <p className="empty no-print">No rounds yet. Mark who's present and generate round 1.</p>
      ) : (
        session.rounds.map((round) => (
          <RoundCard
            key={round.index}
            round={round}
            settings={roundSettings(round, session.config)}
            totalRounds={session.config.totalRounds}
            printing={printIndex === round.index}
            rating={ratingFor(round.ratingMode ?? 'grade')}
            gender={gender}
            name={name}
            selected={selected}
            onChip={onChipClick}
            onRemove={onRemoveFromRound}
            onAddToSide={onAddToSide}
            onSettings={setRoundSettings}
            onRegenerate={regenerateRound}
            onDelete={deleteRound}
            onToggleLock={() => toggleLock(round.index)}
            onPrint={() => setPrintIndex(round.index)}
          />
        ))
      )}
    </div>
  );
}

interface RoundCardProps {
  round: Round;
  settings: RoundSettings;
  /** Rounds the session is planned to run, for the "round 2 of 6" heading. */
  totalRounds: number;
  /** This round is the one being printed, so it is the only card on the sheet. */
  printing: boolean;
  rating: (id: string) => number;
  gender: (id: string) => Gender;
  name: (id: string) => string;
  selected: { round: number; id: string } | null;
  onChip: (roundIndex: number, id: string, locked: boolean) => void;
  onRemove: (roundIndex: number, id: string) => void;
  onAddToSide: (roundIndex: number, id: string, court: number, side: 'A' | 'B') => void;
  onSettings: (roundIndex: number, patch: Partial<RoundSettings>) => void;
  onRegenerate: (roundIndex: number) => void;
  onDelete: (roundIndex: number) => void;
  onToggleLock: () => void;
  onPrint: () => void;
}

function RoundCard({
  round,
  settings,
  totalRounds,
  printing,
  rating,
  gender,
  name,
  selected,
  onChip,
  onRemove,
  onAddToSide,
  onSettings,
  onRegenerate,
  onDelete,
  onToggleLock,
  onPrint
}: RoundCardProps) {
  const ratingMode = settings.ratingMode;
  // Grades are shown as D6; WTNs as 28.2, so the chip reads as the number drawn on.
  const ratingLabel = (id: string) =>
    ratingMode === 'wtn' ? rating(id).toFixed(1) : `D${rating(id)}`;

  const chip = (id: string) => {
    const isSel = selected?.round === round.index && selected.id === id;
    return (
      <button
        key={id}
        className={`chip ${isSel ? 'selected' : ''}`}
        onClick={() => onChip(round.index, id, round.locked)}
        title={round.locked ? 'Round locked' : 'Click two players to swap them'}
      >
        <span className="nm">{name(id)}</span>
        <span className="badge grade">{ratingLabel(id)}</span>
        <span className={`badge ${gender(id).toLowerCase()}`}>{gender(id)}</span>
        {!round.locked && (
          <span
            className="chip-x no-print"
            role="button"
            aria-label={`Remove ${name(id)} from round`}
            title="Remove from round"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(round.index, id);
            }}
          >
            ×
          </span>
        )}
      </button>
    );
  };

  // When a bye player is selected in this round, court sides offer to take them.
  const addTargetId =
    selected && selected.round === round.index && !round.locked && round.byes.includes(selected.id)
      ? selected.id
      : null;

  return (
    <div
      className={printing ? 'card print-target' : 'card'}
      // Print sizes a court off how many rows share a sheet, not the round's total.
      style={
        {
          '--print-rows': Math.min(
            Math.ceil(round.matches.length / PRINT_COLUMNS),
            PRINT_ROWS_PER_PAGE
          )
        } as React.CSSProperties
      }
    >
      <h3>
        Round {round.index + 1}
        {round.index + 1 <= totalRounds && ` of ${totalRounds}`}
        {/* On screen the controls below say all this; the print sheet needs it spelled out. */}
        <span className="print-only inline">
          {' '}
          <span className="badge">{settings.pairingMode === 'balanced' ? 'Balanced' : 'Mixed'}</span>{' '}
          <span className="badge">{settings.genderMode === 'same' ? 'Same gender' : 'Mixed gender'}</span>{' '}
          <span className="badge">{ratingMode === 'wtn' ? 'By WTN' : 'By grade'}</span>
        </span>
      </h3>

      <div className="settings-bar no-print">
        <SettingsFields
          value={settings}
          disabled={round.locked}
          onChange={(patch) => onSettings(round.index, patch)}
        />
        <span className="grow" />
        <div className="bar-actions">
          <button onClick={onPrint} title="Print this round's draw on its own sheet">
            🖨 Print
          </button>
          <button
            onClick={() => onRegenerate(round.index)}
            disabled={round.locked}
            title="Redraw this round with the settings above, keeping earlier rounds as history"
          >
            ↻ Redraw
          </button>
          <button
            className={round.locked ? 'primary' : ''}
            onClick={onToggleLock}
            title={round.locked ? 'Unlock to edit or redraw this round' : 'Lock this round so it cannot be edited or redrawn'}
          >
            {round.locked ? '🔒 Locked' : 'Lock'}
          </button>
          <button
            className="ghost danger"
            onClick={() => confirm(`Delete round ${round.index + 1}?`) && onDelete(round.index)}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="courts">
        {round.matches.map((m) => (
          <CourtCard
            key={m.court}
            match={m}
            rating={rating}
            ratingMode={ratingMode}
            gender={gender}
            tolerance={settings.evenTolerance}
            chip={chip}
            addTargetId={addTargetId}
            onAdd={(court, side) => addTargetId && onAddToSide(round.index, addTargetId, court, side)}
          />
        ))}
      </div>

      {round.byes.length > 0 && (
        <div className="no-print" style={{ marginTop: '0.6rem' }}>
          <span className="tag">Bye:</span> {round.byes.map((id) => chip(id))}
          {addTargetId && (
            <span className="small muted" style={{ marginLeft: '0.4rem' }}>
              — pick a court's “＋ Add here” to place {name(addTargetId)}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface CourtCardProps {
  match: Match;
  rating: (id: string) => number;
  ratingMode: RatingMode;
  gender: (id: string) => Gender;
  tolerance: number;
  chip: (id: string) => React.ReactNode;
  addTargetId: string | null;
  onAdd: (court: number, side: 'A' | 'B') => void;
}

function CourtCard({ match, rating, ratingMode, gender, tolerance, chip, addTargetId, onAdd }: CourtCardProps) {
  const gap = matchGap(match, rating);
  const even = gap <= tolerance;
  const mvw = isMenVsWomen(match, gender);
  const label = match.format === 'doubles' ? 'Doubles' : match.format === 'singles' ? 'Singles' : 'Uneven 1v2';
  const addBtn = (side: 'A' | 'B') => {
    const full = (side === 'A' ? match.sideA : match.sideB).length >= 2;
    return addTargetId && !full ? (
      <button className="add-here no-print" onClick={() => onAdd(match.court, side)}>
        ＋ Add here
      </button>
    ) : null;
  };
  return (
    <div className="court">
      <h4>
        <span>
          Court {match.court} <span className="tag">{label}</span>
        </span>
        <span
          className={even ? 'gap-ok' : 'gap-warn'}
          title={ratingMode === 'wtn' ? 'Average-WTN difference' : 'Average-grade difference'}
        >
          Δ{gap.toFixed(1)}
        </span>
      </h4>
      <div className="side">{match.sideA.map((id) => chip(id))}{addBtn('A')}</div>
      <div className="vs">vs</div>
      <div className="side">{match.sideB.map((id) => chip(id))}{addBtn('B')}</div>
      {mvw && <div className="flag">⚠ 2 men vs 2 women</div>}
    </div>
  );
}
