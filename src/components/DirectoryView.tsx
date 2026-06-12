import { useMemo, useState } from 'react';
import type { Gender, Player } from '../types';
import { GRADE_MAX, GRADE_MIN } from '../types';
import { uid } from '../util';
import { parsePlayers } from '../csv';

interface Props {
  players: Player[];
  onUpsert: (p: Player) => void;
  onRemove: (id: string) => void;
}

const blankForm = { id: '', name: '', grade: '6', gender: 'M' as Gender, phone: '', club: '', notes: '' };

export default function DirectoryView({ players, onUpsert, onRemove }: Props) {
  type SortCol = 'name' | 'grade' | 'gender' | 'club';
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };
  const [form, setForm] = useState({ ...blankForm });
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? players.filter((p) => p.name.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q))
      : players;
    return list.slice().sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortCol === 'grade') cmp = a.grade - b.grade;
      else if (sortCol === 'gender') cmp = a.gender.localeCompare(b.gender);
      else if (sortCol === 'club') cmp = (a.club ?? '').localeCompare(b.club ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [players, search, sortCol, sortDir]);

  const submit = () => {
    const name = form.name.trim();
    const grade = Number(form.grade);
    if (!name) return alert('Name is required.');
    if (!Number.isFinite(grade) || grade < GRADE_MIN || grade > GRADE_MAX)
      return alert(`Grade must be D${GRADE_MIN}–D${GRADE_MAX}.`);
    onUpsert({
      id: form.id || uid(),
      name,
      grade,
      gender: form.gender,
      phone: form.phone.trim(),
      club: form.club.trim() || undefined,
      notes: form.notes.trim() || undefined
    });
    setForm({ ...blankForm });
    setShowForm(false);
  };

  const edit = (p: Player) => {
    setShowForm(true);
    setForm({
      id: p.id,
      name: p.name,
      grade: String(p.grade),
      gender: p.gender,
      phone: p.phone ?? '',
      club: p.club ?? '',
      notes: p.notes ?? ''
    });
  };

  const findExisting = (name: string, gender: string, phone: string | undefined) => {
    const normName = name.trim().toLowerCase().replace(/\s+/g, ' ');
    return players.find((p) => {
      if (p.name.trim().toLowerCase().replace(/\s+/g, ' ') !== normName) return false;
      if (p.gender !== gender) return false;
      if (phone && p.phone) return phone.trim().toLowerCase() === p.phone.trim().toLowerCase();
      return true;
    });
  };

  const runImport = () => {
    const { players: parsed, errors } = parsePlayers(importText);
    let added = 0;
    let updated = 0;
    for (const p of parsed) {
      const existing = findExisting(p.name, p.gender, p.phone);
      onUpsert({
        id: existing?.id ?? uid(),
        name: p.name,
        grade: p.grade,
        gender: p.gender,
        phone: p.phone,
        club: p.club,
        notes: p.notes
      });
      existing ? updated++ : added++;
    }
    setImportErrors(errors);
    if (parsed.length) {
      setImportText('');
      alert(`Imported ${added} new, updated ${updated}.${errors.length ? ` ${errors.length} skipped.` : ''}`);
      if (!errors.length) setShowImport(false);
    }
  };

  const exportPlayers = () => {
    const data = {
      app: 'social-tennis-mixer' as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      players
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tennis-players-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list: unknown[] | null = Array.isArray(data)
        ? data
        : Array.isArray((data as { players?: unknown }).players)
          ? (data as { players: unknown[] }).players
          : null;
      if (!list) throw new Error('This file does not contain a player list.');
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const raw of list) {
        const o = raw as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const grade = Number(o.grade);
        const gender: Gender | null = o.gender === 'F' ? 'F' : o.gender === 'M' ? 'M' : null;
        if (!name || !Number.isFinite(grade) || grade < GRADE_MIN || grade > GRADE_MAX || !gender) {
          skipped++;
          continue;
        }
        const phone = typeof o.phone === 'string' && o.phone.trim() ? o.phone.trim() : undefined;
        const existing = findExisting(name, gender, phone);
        onUpsert({
          id: existing?.id ?? uid(),
          name,
          grade,
          gender,
          phone,
          club: typeof o.club === 'string' && o.club.trim() ? o.club.trim() : undefined,
          notes: typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim() : undefined
        });
        existing ? updated++ : added++;
      }
      alert(`Imported ${added} new, updated ${updated}.${skipped ? ` ${skipped} skipped.` : ''}`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="row between">
          <h2>Player Directory ({players.length})</h2>
          <div className="row">
            <button className="primary" onClick={() => { setForm({ ...blankForm }); setShowForm(true); }}>Add New Player</button>
            <button onClick={() => setShowImport((v) => !v)}>
              {showImport ? 'Close import' : 'Import / paste'}
            </button>
            <button onClick={exportPlayers}>Export File</button>
            <label className="button-like">
              <button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>
                Import File
              </button>
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {showImport && (
          <div>
            <p className="small muted">
              Paste from a spreadsheet (tab-separated) or CSV. Columns: <strong>Name, Grade, Gender</strong>{' '}
              (Phone, Club, Notes optional). A header row is detected automatically. Each import adds new entries.
            </p>
            <textarea
              rows={8}
              style={{ width: '100%' }}
              placeholder={'Name\tGrade\tGender\tPhone\nLiz Sellar\t6\tF\t021000000'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {importErrors.length > 0 && (
              <ul className="errors">
                {importErrors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            )}
            <div className="row">
              <button className="primary" onClick={runImport}>
                Import players
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => { setForm({ ...blankForm }); setShowForm(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{form.id ? 'Edit player' : 'Add new player'}</h2>
              <button className="ghost" onClick={() => { setForm({ ...blankForm }); setShowForm(false); }}>✕</button>
            </div>
            <div className="row" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                {Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i).map((g) => (
                  <option key={g} value={String(g)}>D{g}</option>
                ))}
              </select>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <input
                placeholder="Phone (optional)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                placeholder="Club (optional)"
                value={form.club}
                onChange={(e) => setForm({ ...form, club: e.target.value })}
              />
            </div>
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <input
                className="grow"
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="row" style={{ marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setForm({ ...blankForm }); setShowForm(false); }}>Cancel</button>
              <button className="primary" onClick={submit}>
                {form.id ? 'Save changes' : 'Add player'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h3>Players</h3>
          <input
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="empty">No players yet. Add one above or import a list.</p>
        ) : (
          <table>
            <thead>
              <tr>
                {(['name', 'grade', 'gender', 'club'] as SortCol[]).map((col) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  >
                    {col.charAt(0).toUpperCase() + col.slice(1)}
                    {sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                  </th>
                ))}
                <th>Phone</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <span className="badge grade">D{p.grade}</span>
                  </td>
                  <td>
                    <span className={`badge ${p.gender.toLowerCase()}`}>{p.gender === 'M' ? 'Male' : 'Female'}</span>
                  </td>
                  <td>{p.club ?? ''}</td>
                  <td>{p.phone}</td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.notes}>{p.notes ?? ''}</td>
                  <td className="row">
                    <button onClick={() => edit(p)}>
                      Edit
                    </button>
                    <button
                      className="danger"
                      onClick={() => confirm(`Remove ${p.name}?`) && onRemove(p.id)}
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
