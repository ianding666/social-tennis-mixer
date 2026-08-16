import { useMemo, useState } from 'react';
import type { Gender, Player } from '../types';
import { GRADE_MAX, GRADE_MIN, WTN_DEFAULT, WTN_MAX, WTN_MIN } from '../types';
import { uid } from '../util';
import type { ParsedPlayer } from '../csv';
import { parsePlayers, playersToCsv, rowsToText } from '../csv';
import type { FillProgress } from '../wtn';
import { fillDoublesWtn } from '../wtn';

interface Props {
  players: Player[];
  onUpsert: (p: Player) => void;
  onRemove: (id: string) => void;
}

const blankForm = { id: '', name: '', grade: '6', wtn: '', gender: 'M' as Gender, phone: '', club: '', notes: '' };

/** Club exports (ClubSpark among them) carry no playing grade, so imports need a
 *  starting point. Rows that use it are flagged until someone confirms them. */
const DEFAULT_IMPORT_GRADE = 10;
const DEFAULT_IMPORT_GENDER: Gender = 'M';
/** Placeholder for a player the WTN portal has no match for — shared with the draw. */
const DEFAULT_WTN = WTN_DEFAULT;

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const phoneDigits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');

export default function DirectoryView({ players, onUpsert, onRemove }: Props) {
  type SortCol = 'name' | 'grade' | 'wtn' | 'gender' | 'club';
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
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
  const [note, setNote] = useState<{ text: string; problem: boolean } | null>(null);
  const [wtnRun, setWtnRun] = useState<AbortController | null>(null);
  const [progress, setProgress] = useState<FillProgress | null>(null);

  const needsReviewCount = useMemo(
    () => players.filter((p) => p.needsGrade || p.needsGender).length,
    [players]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? players.filter((p) => p.name.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q))
      : players;
    if (reviewOnly) list = list.filter((p) => p.needsGrade || p.needsGender);
    return list.slice().sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortCol === 'grade') cmp = a.grade - b.grade;
      // Players with no WTN sort last either way rather than clumping at the top.
      else if (sortCol === 'wtn') cmp = (a.wtn ?? Infinity) - (b.wtn ?? Infinity);
      else if (sortCol === 'gender') cmp = a.gender.localeCompare(b.gender);
      else if (sortCol === 'club') cmp = (a.club ?? '').localeCompare(b.club ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [players, search, sortCol, sortDir, reviewOnly]);

  const submit = () => {
    const name = form.name.trim();
    const grade = Number(form.grade);
    if (!name) return alert('Name is required.');
    if (!Number.isFinite(grade) || grade < GRADE_MIN || grade > GRADE_MAX)
      return alert(`Grade must be D${GRADE_MIN}–D${GRADE_MAX}.`);
    const wtn = form.wtn.trim() ? Number(form.wtn) : undefined;
    if (wtn !== undefined && (!Number.isFinite(wtn) || wtn < WTN_MIN || wtn > WTN_MAX))
      return alert(`WTN must be ${WTN_MIN}–${WTN_MAX}, or blank.`);
    const existing = players.find((p) => p.id === form.id);
    onUpsert({
      ...existing,
      id: form.id || uid(),
      name,
      grade,
      wtn,
      gender: form.gender,
      phone: form.phone.trim(),
      club: form.club.trim() || undefined,
      notes: form.notes.trim() || undefined,
      // Saving the form is the confirmation a defaulted value was waiting for.
      needsGrade: false,
      needsGender: false,
      needsWtn: wtn === undefined ? undefined : false
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
      wtn: p.wtn === undefined ? '' : String(p.wtn),
      gender: p.gender,
      phone: p.phone ?? '',
      club: p.club ?? '',
      notes: p.notes ?? ''
    });
  };

  /**
   * Match on name, using phone only to tell same-named people apart. Matching on
   * phone first is tempting but wrong: couples share a number, so it merges two
   * different people into one.
   */
  const findExisting = (roster: Player[], p: ParsedPlayer) => {
    const sameName = roster.filter((x) => normName(x.name) === normName(p.name));
    if (sameName.length < 2) return sameName[0];
    const digits = phoneDigits(p.phone);
    return (
      (digits && sameName.find((x) => phoneDigits(x.phone) === digits)) ||
      (p.gender && sameName.find((x) => x.gender === p.gender)) ||
      sameName[0]
    );
  };

  /** Upsert parsed rows, merging into existing entries rather than replacing them. */
  const applyParsed = (parsed: ParsedPlayer[]) => {
    // Track what we have written: `players` is stale until React re-renders, so
    // without this two rows for the same person in one file both come in as new.
    const roster = players.slice();
    const flagged = new Set<string>();
    let added = 0;
    let updated = 0;

    for (const p of parsed) {
      const existing = findExisting(roster, p);
      // A confirmed grade or gender already in the directory outranks the file,
      // so re-importing a source with no grades never resets what you have set.
      const keepGrade = existing && !existing.needsGrade;
      const keepGender = existing && !existing.needsGender;
      const merged: Player = {
        id: existing?.id ?? uid(),
        name: p.name,
        grade: (keepGrade ? existing?.grade : p.grade ?? existing?.grade) ?? DEFAULT_IMPORT_GRADE,
        wtn: p.wtn ?? existing?.wtn,
        gender: (keepGender ? existing?.gender : p.gender ?? existing?.gender) ?? DEFAULT_IMPORT_GENDER,
        phone: p.phone || existing?.phone,
        club: p.club ?? existing?.club,
        notes: p.notes ?? existing?.notes,
        extId: p.extId ?? existing?.extId,
        needsGrade: p.grade === undefined && !keepGrade,
        needsGender: p.gender === undefined && !keepGender
      };
      onUpsert(merged);

      if (existing) {
        roster[roster.indexOf(existing)] = merged;
        updated++;
      } else {
        roster.push(merged);
        added++;
      }
      if (merged.needsGrade || merged.needsGender) flagged.add(merged.id);
    }
    // Rows, not people: two rows for one player must count once.
    return { added, updated, flagged: flagged.size };
  };

  const summarise = (
    counts: { added: number; updated: number; flagged: number },
    errors: string[]
  ) =>
    [
      `Imported ${counts.added} new, updated ${counts.updated}.`,
      counts.flagged
        ? `${counts.flagged} need a grade or gender — filter by "Needs review" to fill them in.`
        : '',
      errors.length ? `${errors.length} skipped (no name).` : ''
    ]
      .filter(Boolean)
      .join('\n');

  /** Re-lay the paste box into aligned columns — also normalises a raw CSV paste. */
  const realign = () => {
    const { players: parsed, errors } = parsePlayers(importText);
    if (!parsed.length) {
      setNote({ text: 'Nothing to align — no rows with a name.', problem: true });
      return;
    }
    setImportText(rowsToText(parsed, '\t', { lineBreak: '\n', pad: true }));
    if (errors.length) {
      setNote({ text: `${errors.length} rows had no name and were dropped.`, problem: true });
    }
  };

  const runImport = () => {
    const { players: parsed, errors } = parsePlayers(importText);
    if (!parsed.length) {
      setNote({ text: 'Nothing to import — no rows with a name.', problem: true });
      return;
    }
    const counts = applyParsed(parsed);
    setImportText('');
    setNote(null);
    setShowImport(false);
    alert(summarise(counts, errors));
  };

  const exportPlayers = () => {
    const blob = new Blob(['﻿' + playersToCsv(players)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tennis-mixer-player-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Load a file into the paste box rather than importing it straight away: the
   * rows arrive normalised into our own columns, so gaps a club export leaves
   * (grade, gender) show as blank cells you can fill in before committing.
   */
  const loadFile = async (file: File) => {
    try {
      if (importText.trim() && !confirm('Replace what is in the paste box?')) return;
      const { players: parsed, errors } = parsePlayers(await file.text());
      if (!parsed.length) {
        throw new Error('This file does not contain any player rows.');
      }
      const stage = () => setImportText(rowsToText(parsed, '\t', { lineBreak: '\n', pad: true }));
      stage();
      setShowImport(true);

      const noGrade = parsed.filter((p) => p.grade === undefined).length;
      const noGender = parsed.filter((p) => p.gender === undefined).length;
      const loaded = [
        `${parsed.length} rows from ${file.name}.`,
        noGrade ? `${noGrade} without a grade (blank = D${DEFAULT_IMPORT_GRADE}).` : '',
        noGender ? `${noGender} without a gender (blank = ${DEFAULT_IMPORT_GENDER}).` : '',
        errors.length ? `${errors.length} rows had no name and were dropped.` : ''
      ]
        .filter(Boolean)
        .join(' ');

      setNote({
        text: `${loaded} Edit below, then Import players.`,
        problem: errors.length > 0
      });
    } catch (e) {
      setNote({ text: (e as Error).message, problem: true });
      setShowImport(true);
    }
  };

  /**
   * Refresh doubles WTNs for the whole directory from the Tennis NZ results
   * portal. Ratings move over time, so this re-reads everyone rather than only
   * filling blanks. A player the portal can't resolve gets the placeholder
   * D{DEFAULT_WTN} flagged as unconfirmed, unless someone has already set a real
   * number for them — a confirmed value is never overwritten by the placeholder.
   */
  const syncWtn = async () => {
    if (!players.length || wtnRun) return;
    const ok = confirm(
      `Look up the doubles WTN for ${players.length} player${players.length > 1 ? 's' : ''} ` +
        `from results.matchpoint.kiwi?\n\nThat is one request per player and takes about ` +
        `${Math.ceil(players.length / 10)}s. You can stop it part way.`
    );
    if (!ok) return;

    const controller = new AbortController();
    setWtnRun(controller);
    setProgress({ done: 0, total: players.length, matched: 0 });
    try {
      const rows = players.map((p) => ({ id: p.id, name: p.name, gender: p.gender, wtn: undefined as number | undefined }));
      // Collect per row rather than upserting mid-run: only rows that actually
      // completed are here, so stopping early never defaults the untouched ones.
      const finished: { id: string; wtn?: number }[] = [];
      const summary = await fillDoublesWtn(rows, {
        signal: controller.signal,
        onProgress: setProgress,
        onRow: (row, result) => finished.push({ id: row.id, wtn: result.wtn })
      });

      let changed = 0;
      let unchanged = 0;
      let defaulted = 0;
      let kept = 0;
      for (const row of finished) {
        const player = players.find((p) => p.id === row.id);
        if (!player) continue;

        if (row.wtn !== undefined) {
          if (player.wtn === row.wtn && !player.needsWtn) unchanged++;
          else {
            onUpsert({ ...player, wtn: row.wtn, needsWtn: false });
            changed++;
          }
        } else if (player.wtn !== undefined && !player.needsWtn) {
          kept++; // a real number someone set by hand — the portal doesn't get to clear it
        } else if (player.wtn === DEFAULT_WTN && player.needsWtn) {
          unchanged++;
        } else {
          onUpsert({ ...player, wtn: DEFAULT_WTN, needsWtn: true });
          defaulted++;
        }
      }

      alert(
        [
          `WTN sync${controller.signal.aborted ? ' (stopped early)' : ''}: ${summary.matched} found.`,
          `${changed} updated, ${unchanged} already current.`,
          defaulted ? `${defaulted} not found — set to ${DEFAULT_WTN.toFixed(1)}? pending review.` : '',
          kept ? `${kept} not found but kept their existing number.` : '',
          summary.ambiguous ? `${summary.ambiguous} matched more than one player.` : '',
          summary.errors ? `${summary.errors} lookup errors.` : ''
        ]
          .filter(Boolean)
          .join('\n')
      );
    } finally {
      setWtnRun(null);
      setProgress(null);
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
              {showImport ? 'Close import' : 'Paste CSV'}
            </button>
            <button onClick={exportPlayers}>Export CSV File</button>
            <label className="button-like">
              <button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>
                Import CSV File
              </button>
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {showImport && (
          <div>
            <p className="small muted">
              Paste from a spreadsheet (tab-separated) or CSV, or use <strong>Import CSV File</strong> to
              drop a club export in here. Columns: <strong>Name</strong> (or First name / Last name),
              plus Grade, WTN, Gender, Phone, Club and Notes where you have them. A header row is
              detected automatically. Blank grades import as D{DEFAULT_IMPORT_GRADE} and blank genders as{' '}
              {DEFAULT_IMPORT_GENDER === 'M' ? 'Male' : 'Female'}, flagged for review.
            </p>
            {note && <p className={`small ${note.problem ? 'errors' : 'muted'}`}>{note.text}</p>}
            <textarea
              rows={importText ? 16 : 8}
              // tabSize 1 keeps a tab exactly one character wide, so the space
              // padding decides where each column starts rather than tab stops.
              style={{ width: '100%', fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto', tabSize: 1 }}
              placeholder={'Name\tGrade\tGender\tPhone\nLiz Sellar\t6\tF\t021000000'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              spellCheck={false}
            />
            <div className="row">
              <button className="primary" onClick={runImport} disabled={!importText.trim()}>
                Import players
              </button>
              {importText && (
                <>
                  <button onClick={realign}>Realign columns</button>
                  <button onClick={() => { setImportText(''); setNote(null); }}>Clear</button>
                </>
              )}
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
              <input
                type="number"
                step="0.1"
                min={WTN_MIN}
                max={WTN_MAX}
                style={{ width: 110 }}
                placeholder="WTN"
                value={form.wtn}
                onChange={(e) => setForm({ ...form, wtn: e.target.value })}
              />
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
          <div className="row">
            {wtnRun ? (
              <button className="danger" onClick={() => wtnRun.abort()}>
                Stop WTN sync
              </button>
            ) : (
              <button onClick={syncWtn} disabled={!players.length}>
                Sync WTN
              </button>
            )}
            {needsReviewCount > 0 && (
              <label className="small" style={{ whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={reviewOnly}
                  onChange={(e) => setReviewOnly(e.target.checked)}
                />{' '}
                Needs review ({needsReviewCount})
              </label>
            )}
            <input
              placeholder="Search name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {progress && (
          <div style={{ margin: '0.5rem 0 0.75rem' }}>
            <div className="row between small muted" style={{ marginBottom: '0.25rem' }}>
              <span>
                Looking up doubles WTN — {progress.done} of {progress.total}, {progress.matched} found
              </span>
              <span>{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
            >
              <span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="empty">
            {reviewOnly ? 'Nothing left to review.' : 'No players yet. Add one above or import a list.'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                {(['name', 'grade', 'wtn', 'gender', 'club'] as SortCol[]).map((col) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  >
                    {col === 'wtn' ? 'WTN' : col.charAt(0).toUpperCase() + col.slice(1)}
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
                    <span className={`badge grade${p.needsGrade ? ' unconfirmed' : ''}`} title={p.needsGrade ? 'Grade defaulted on import — not confirmed' : undefined}>
                      D{p.grade}{p.needsGrade ? '?' : ''}
                    </span>
                  </td>
                  <td>
                    {p.wtn === undefined ? (
                      ''
                    ) : p.needsWtn ? (
                      <span className="badge unconfirmed" title="No match on the portal — placeholder, not confirmed">
                        {p.wtn.toFixed(1)}?
                      </span>
                    ) : (
                      p.wtn.toFixed(1)
                    )}
                  </td>
                  <td>
                    <span className={`badge ${p.gender.toLowerCase()}${p.needsGender ? ' unconfirmed' : ''}`} title={p.needsGender ? 'Gender defaulted on import — not confirmed' : undefined}>
                      {p.gender === 'M' ? 'Male' : 'Female'}{p.needsGender ? '?' : ''}
                    </span>
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
