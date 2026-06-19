import { useMemo, useState } from 'react';
import type { Gender, GenderMode, Match, PairingMode, Player, Round, Session, SessionPlayer } from '../types';
import { GRADE_MAX, GRADE_MIN } from '../types';
import { deriveHistory, generateRound, isMenVsWomen, matchGap, planRound, type PlayerLite } from '../draw';
import { uid } from '../util';

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

export default function SessionView({ session, players, onChange, onAddPlayerToDirectory }: Props) {
  const [search, setSearch] = useState('');
  const [nextMode, setNextMode] = useState<PairingMode>('balanced');
  const [nextGenderMode, setNextGenderMode] = useState<GenderMode>('same');
  const [selected, setSelected] = useState<{ round: number; id: string } | null>(null);
  const [walkin, setWalkin] = useState({ name: '', grade: '6', gender: 'M' as Gender, phone: '' });

  const playerById = useMemo(() => {
    const m = new Map<string, SessionPlayer>();
    for (const p of session.players) m.set(p.playerId, p);
    return m;
  }, [session.players]);

  const grade = (id: string) => playerById.get(id)?.grade ?? 0;
  const gender = (id: string) => (playerById.get(id)?.gender ?? 'M') as Gender;
  const name = (id: string) => playerById.get(id)?.name ?? '?';

  const activeSet = useMemo(() => new Set(session.activePlayerIds), [session.activePlayerIds]);
  const activeLite: PlayerLite[] = session.players
    .filter((p) => activeSet.has(p.playerId))
    .map((p) => ({ id: p.playerId, grade: p.grade, gender: p.gender }));

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
    const sp: SessionPlayer = { playerId: p.id, name: p.name, grade: p.grade, gender: p.gender, phone: p.phone };
    update({
      players: [...session.players, sp],
      activePlayerIds: [...session.activePlayerIds, p.id]
    });
  };

  const addWalkin = () => {
    const nm = walkin.name.trim();
    const g = Number(walkin.grade);
    if (!nm) return alert('Name required.');
    if (!Number.isFinite(g) || g < GRADE_MIN || g > GRADE_MAX) return alert(`Grade D${GRADE_MIN}–D${GRADE_MAX}.`);
    const player: Player = { id: uid(), name: nm, grade: g, gender: walkin.gender, phone: walkin.phone.trim() };
    onAddPlayerToDirectory(player);
    addFromDirectory(player);
    setWalkin({ name: '', grade: '6', gender: 'M', phone: '' });
  };

  const togglePresent = (id: string) => {
    update({
      activePlayerIds: activeSet.has(id)
        ? session.activePlayerIds.filter((x) => x !== id)
        : [...session.activePlayerIds, id]
    });
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

  const setConfig = (patch: Partial<Session['config']>) =>
    update({ config: { ...session.config, ...patch } });

  const generateNext = () => {
    if (activeLite.length < 2) return alert('Mark at least 2 players present.');
    const history = deriveHistory(session.rounds);
    const round = generateRound({
      active: activeLite,
      mode: nextMode,
      genderMode: nextGenderMode,
      config: session.config,
      history,
      index: session.rounds.length
    });
    update({ rounds: [...session.rounds, round] });
  };

  const regenerateLast = () => {
    const i = session.rounds.length - 1;
    if (i < 0) return;
    const last = session.rounds[i];
    if (last.locked) return;
    const history = deriveHistory(session.rounds.slice(0, i));
    const round = generateRound({
      active: activeLite,
      mode: last.pairingMode,
      genderMode: last.genderMode ?? 'same',
      config: session.config,
      history,
      index: i
    });
    update({ rounds: [...session.rounds.slice(0, i), round] });
  };

  const deleteLast = () => {
    if (session.rounds.length === 0) return;
    update({ rounds: session.rounds.slice(0, -1) });
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

  const plan = planRound(activeLite.length, session.config.courtCount);

  const sortedRoster = session.players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="card no-print">
        <div className="row between">
          <h2>{session.name}</h2>
          <button onClick={() => window.print()}>Print draw</button>
        </div>
        <div className="row">
          <label className="small">
            Courts{' '}
            <input
              type="number"
              min={1}
              max={20}
              style={{ width: 64 }}
              value={session.config.courtCount}
              onChange={(e) => setConfig({ courtCount: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label className="small">
            Round mins{' '}
            <input
              type="number"
              min={5}
              max={120}
              style={{ width: 64 }}
              value={session.config.roundMinutes}
              onChange={(e) => setConfig({ roundMinutes: Math.max(5, Number(e.target.value) || 30) })}
            />
          </label>
          <label className="small">
            Total rounds{' '}
            <input
              type="number"
              min={1}
              max={20}
              style={{ width: 64 }}
              value={session.config.totalRounds}
              onChange={(e) => setConfig({ totalRounds: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label
            className="small"
            title="Largest allowed difference between the two sides' average grades for a match to count as “even”. Lower = stricter (tighter matches); higher = more flexible. Draws show Δ in green when within this."
          >
            Even tolerance <InfoIcon />{' '}
            <input
              type="number"
              step={0.5}
              min={0}
              max={6}
              style={{ width: 64 }}
              value={session.config.evenTolerance}
              onChange={(e) => setConfig({ evenTolerance: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label
            className="small"
            title="Balanced mode only: largest grade gap allowed between two partners on the same side. Lower = partners must be closer in grade."
          >
            Balanced partner gap <InfoIcon />{' '}
            <input
              type="number"
              min={0}
              max={10}
              style={{ width: 64 }}
              value={session.config.balancedPartnerGap}
              onChange={(e) => setConfig({ balancedPartnerGap: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        </div>
      </div>

      <div className="card no-print">
        <h3>
          Roster — {activeLite.length} present of {session.players.length}
        </h3>
        <p className="small muted">
          Next round: {plan.formats.filter((f) => f === 'doubles').length} doubles
          {plan.formats.includes('singles') && ' + 1 singles'}
          {plan.formats.includes('uneven') && ' + 1 uneven (1v2)'}
          {plan.byeCount > 0 && `, ${plan.byeCount} bye${plan.byeCount > 1 ? 's' : ''}`}.
        </p>

        <div className="row">
          <input
            className="grow"
            placeholder="Add from directory — search name or phone…"
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

        {sortedRoster.length > 0 && (
          <table style={{ marginTop: '0.6rem' }}>
            <thead>
              <tr>
                <th>Present</th>
                <th>Name</th>
                <th>Grade</th>
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
        )}
      </div>

      <div className="card no-print">
        <div className="row between">
          <h3>Generate</h3>
          <div className="row">
            <label className="small">
              Grading Mode{' '}
              <select value={nextMode} onChange={(e) => setNextMode(e.target.value as PairingMode)}>
                <option value="balanced">Balanced (similar grades)</option>
                <option value="mixed">Mixed (strong + weak)</option>
              </select>
            </label>
            <label className="small">
              Gender Mode{' '}
              <select
                value={nextGenderMode}
                onChange={(e) => setNextGenderMode(e.target.value as GenderMode)}
              >
                <option value="same">Same gender</option>
                <option value="mixed">Mixed gender</option>
              </select>
            </label>
            <button className="primary" onClick={generateNext}>
              {session.rounds.length === 0 ? 'Generate round 1' : `Generate round ${session.rounds.length + 1}`}
            </button>
            {session.rounds.length > 0 && !session.rounds[session.rounds.length - 1].locked && (
              <button onClick={regenerateLast}>Regenerate last</button>
            )}
            {session.rounds.length > 0 && (
              <button className="ghost danger" onClick={deleteLast}>
                Delete last
              </button>
            )}
          </div>
        </div>
      </div>

      {session.rounds.length === 0 ? (
        <p className="empty no-print">No rounds yet. Mark who's present and generate round 1.</p>
      ) : (
        session.rounds.map((round) => (
          <RoundCard
            key={round.index}
            round={round}
            grade={grade}
            gender={gender}
            name={name}
            tolerance={session.config.evenTolerance}
            selected={selected}
            onChip={onChipClick}
            onToggleLock={() => toggleLock(round.index)}
          />
        ))
      )}

      {Array.from({ length: Math.max(0, session.config.totalRounds - session.rounds.length) }, (_, i) => (
        <PlaceholderRoundCard
          key={`placeholder-${i}`}
          roundNumber={session.rounds.length + i + 1}
          courtCount={session.config.courtCount}
        />
      ))}
    </div>
  );
}

interface RoundCardProps {
  round: Round;
  grade: (id: string) => number;
  gender: (id: string) => Gender;
  name: (id: string) => string;
  tolerance: number;
  selected: { round: number; id: string } | null;
  onChip: (roundIndex: number, id: string, locked: boolean) => void;
  onToggleLock: () => void;
}

function RoundCard({ round, grade, gender, name, tolerance, selected, onChip, onToggleLock }: RoundCardProps) {
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
        <span className="badge grade">D{grade(id)}</span>
        <span className={`badge ${gender(id).toLowerCase()}`}>{gender(id)}</span>
      </button>
    );
  };

  return (
    <div className="card" style={{ '--court-count': round.matches.length } as React.CSSProperties}>
      <div className="row between">
        <h3>
          Round {round.index + 1}{' '}
          <span className="badge">{round.pairingMode === 'balanced' ? 'Balanced' : 'Mixed'}</span>{' '}
          <span className="badge">{(round.genderMode ?? 'same') === 'same' ? 'Same gender' : 'Mixed gender'}</span>
        </h3>
        <label className="small no-print">
          <input type="checkbox" checked={round.locked} onChange={onToggleLock} /> Lock
        </label>
      </div>

      <div className="courts">
        {round.matches.map((m) => (
          <CourtCard key={m.court} match={m} grade={grade} gender={gender} tolerance={tolerance} chip={chip} />
        ))}
      </div>

      {round.byes.length > 0 && (
        <div className="no-print" style={{ marginTop: '0.6rem' }}>
          <span className="tag">Bye:</span> {round.byes.map((id) => chip(id))}
        </div>
      )}
    </div>
  );
}

interface CourtCardProps {
  match: Match;
  grade: (id: string) => number;
  gender: (id: string) => Gender;
  tolerance: number;
  chip: (id: string) => React.ReactNode;
}

function CourtCard({ match, grade, gender, tolerance, chip }: CourtCardProps) {
  const gap = matchGap(match, grade);
  const even = gap <= tolerance;
  const mvw = isMenVsWomen(match, gender);
  const label = match.format === 'doubles' ? 'Doubles' : match.format === 'singles' ? 'Singles' : 'Uneven 1v2';
  return (
    <div className="court">
      <h4>
        <span>
          Court {match.court} <span className="tag">{label}</span>
        </span>
        <span className={even ? 'gap-ok' : 'gap-warn'} title="Average-grade difference">
          Δ{gap.toFixed(1)}
        </span>
      </h4>
      <div className="side">{match.sideA.map((id) => chip(id))}</div>
      <div className="vs">vs</div>
      <div className="side">{match.sideB.map((id) => chip(id))}</div>
      {mvw && <div className="flag">⚠ 2 men vs 2 women</div>}
    </div>
  );
}

function PlaceholderRoundCard({ roundNumber, courtCount }: { roundNumber: number; courtCount: number }) {
  return (
    <div className="card print-only" style={{ '--court-count': courtCount } as React.CSSProperties}>
      <div className="row between">
        <h3>Round {roundNumber}</h3>
      </div>
      <div className="courts">
        {Array.from({ length: courtCount }, (_, i) => (
          <div className="court" key={i}>
            <h4>
              <span>Court {i + 1} <span className="tag">Doubles</span></span>
            </h4>
            <div className="side placeholder-side" />
            <div className="vs">vs</div>
            <div className="side placeholder-side" />
          </div>
        ))}
      </div>
    </div>
  );
}
