import { useMemo, useState } from 'react';
import type { Player, Session, SessionPlayer } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { todayISO, uid } from '../util';
import { deriveHistory } from '../draw';
import CountInput from './CountInput';

interface Props {
  sessions: Session[];
  players: Player[];
  onOpen: (id: string) => void;
  onCreate: (s: Session) => void;
  onRemove: (id: string) => void;
}

export default function SessionsView({ sessions, players, onOpen, onCreate, onRemove }: Props) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayISO());
  const [courtCount, setCourtCount] = useState(DEFAULT_CONFIG.courtCount);
  const [loadDirectory, setLoadDirectory] = useState(false);

  /**
   * Players who have actually been on court, per session — the roster also holds
   * people who were added but never drawn into a match, so it reads higher.
   */
  const playedCount = useMemo(
    () => new Map(sessions.map((s) => [s.id, deriveHistory(s.rounds).playedCount.size] as const)),
    [sessions]
  );

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return alert('Give the session a name.');
    const roster: SessionPlayer[] = loadDirectory
      ? players.map((p) => ({ playerId: p.id, name: p.name, grade: p.grade, wtn: p.wtn, gender: p.gender, phone: p.phone }))
      : [];
    const session: Session = {
      id: uid(),
      name: trimmed,
      date,
      config: { ...DEFAULT_CONFIG, courtCount },
      players: roster,
      activePlayerIds: [],
      rounds: []
    };
    onCreate(session);
    setName('');
    setCourtCount(DEFAULT_CONFIG.courtCount);
    setLoadDirectory(false);
    onOpen(session.id);
  };

  return (
    <div>
      <div className="card">
        <h2>New session</h2>
        <div className="row">
          <input
            className="grow"
            style={{ minWidth: 350 }}
            placeholder="Session name (e.g. 16 May)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="small" title="Courts the session starts with — any round can be drawn on a different number.">
            Courts <CountInput value={courtCount} style={{ width: 64 }} onChange={setCourtCount} />
          </label>
          {players.length > 0 && (
            <label className="small">
              <input
                type="checkbox"
                checked={loadDirectory}
                onChange={(e) => setLoadDirectory(e.target.checked)}
              />{' '}
              Load all {players.length} player{players.length === 1 ? '' : 's'}
            </label>
          )}
          <button className="primary" onClick={create}>
            Create
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Sessions</h3>
        {sessions.length === 0 ? (
          <p className="empty">No sessions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th title="Players who have been on court in at least one round.">Players</th>
                <th>Rounds</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="ghost" onClick={() => onOpen(s.id)}>
                      <strong>{s.name}</strong>
                    </button>
                  </td>
                  <td>{s.date}</td>
                  <td>{playedCount.get(s.id) ?? 0}</td>
                  <td>{s.rounds.length}</td>
                  <td className="row">
                    <button onClick={() => onOpen(s.id)}>Open</button>
                    <button
                      className="ghost danger"
                      onClick={() => confirm(`Delete session "${s.name}"?`) && onRemove(s.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
