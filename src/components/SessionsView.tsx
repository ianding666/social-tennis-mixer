import { useState } from 'react';
import type { Session } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { todayISO, uid } from '../util';

interface Props {
  sessions: Session[];
  onOpen: (id: string) => void;
  onCreate: (s: Session) => void;
  onRemove: (id: string) => void;
}

export default function SessionsView({ sessions, onOpen, onCreate, onRemove }: Props) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayISO());

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return alert('Give the session a name.');
    const session: Session = {
      id: uid(),
      name: trimmed,
      date,
      config: { ...DEFAULT_CONFIG },
      players: [],
      activePlayerIds: [],
      rounds: []
    };
    onCreate(session);
    setName('');
    onOpen(session.id);
  };

  return (
    <div>
      <div className="card">
        <h2>New session</h2>
        <div className="row">
          <input
            className="grow"
            placeholder="Session name (e.g. 16 May)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                <th>Players</th>
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
                  <td>{s.players.length}</td>
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
