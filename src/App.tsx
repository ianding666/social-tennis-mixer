import { useEffect, useState } from 'react';
import type { Player, Session } from './types';
import * as db from './db';
import DirectoryView from './components/DirectoryView';
import SessionsView from './components/SessionsView';
import SessionView from './components/SessionView';
import RulesModal from './components/RulesModal';
import GettingStartedModal from './components/GettingStartedModal';

type View = 'directory' | 'sessions' | 'session';

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [view, setView] = useState<View>('sessions');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([db.loadPlayers(), db.loadSessions()]);
      setPlayers(p);
      setSessions(s.sort((a, b) => b.date.localeCompare(a.date)));
      setLoaded(true);
    })();
  }, []);

  const upsertPlayer = async (player: Player) => {
    await db.savePlayer(player);
    setPlayers((prev) => {
      const i = prev.findIndex((x) => x.id === player.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = player;
        return next;
      }
      return [...prev, player];
    });
  };

  const removePlayer = async (id: string) => {
    await db.deletePlayer(id);
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const upsertSession = async (session: Session) => {
    await db.saveSession(session);
    setSessions((prev) => {
      const i = prev.findIndex((x) => x.id === session.id);
      const next = i >= 0 ? prev.map((x) => (x.id === session.id ? session : x)) : [...prev, session];
      return next.sort((a, b) => b.date.localeCompare(a.date));
    });
  };

  const removeSession = async (id: string) => {
    await db.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setView('sessions');
    }
  };

  const openSession = (id: string) => {
    setCurrentSessionId(id);
    setView('session');
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  return (
    <>
      <header className="app-header">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Tennis Masters Auckland" className="app-logo" />
        <nav>
          <button className={view === 'directory' ? 'active' : ''} onClick={() => setView('directory')}>
            Player Directory
          </button>
          <button className={view === 'sessions' ? 'active' : ''} onClick={() => setView('sessions')}>
            Sessions
          </button>
          {currentSession && (
            <button className={view === 'session' ? 'active' : ''} onClick={() => setView('session')}>
              {currentSession.name}
            </button>
          )}
        </nav>
        <span className="spacer" />
        <button onClick={() => setGettingStartedOpen(true)}>Getting Started</button>
        <button onClick={() => setRulesOpen(true)}>Matching Rules</button>
      </header>

      <main>
        {!loaded ? (
          <p className="empty">Loading…</p>
        ) : view === 'directory' ? (
          <DirectoryView players={players} onUpsert={upsertPlayer} onRemove={removePlayer} />
        ) : view === 'session' && currentSession ? (
          <SessionView
            session={currentSession}
            players={players}
            onChange={upsertSession}
            onAddPlayerToDirectory={upsertPlayer}
          />
        ) : (
          <SessionsView
            sessions={sessions}
            onOpen={openSession}
            onCreate={upsertSession}
            onRemove={removeSession}
          />
        )}
      </main>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {gettingStartedOpen && <GettingStartedModal onClose={() => setGettingStartedOpen(false)} />}
    </>
  );
}
