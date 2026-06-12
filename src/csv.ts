import type { Gender } from './types';
import { GRADE_MIN, GRADE_MAX } from './types';

export interface ParsedPlayer {
  name: string;
  grade: number;
  gender: Gender;
  phone: string;
  club?: string;
  notes?: string;
}

export interface ParseResult {
  players: ParsedPlayer[];
  errors: string[];
}

function splitRow(line: string): string[] {
  // Tab wins (paste from Excel); otherwise comma.
  const delimiter = line.includes('\t') ? '\t' : ',';
  return line.split(delimiter).map((c) => c.trim());
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, '');
}

function parseGender(raw: string): Gender | null {
  const v = raw.trim().toLowerCase();
  if (['m', 'male', 'man', 'men'].includes(v)) return 'M';
  if (['f', 'female', 'woman', 'women', 'w'].includes(v)) return 'F';
  return null;
}

function parseGrade(raw: string): number | null {
  const m = raw.trim().toUpperCase().match(/D?\s*(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < GRADE_MIN || n > GRADE_MAX) return null;
  return n;
}

/**
 * Parse pasted or CSV text into players. The first row may be a header; if it
 * names known columns we map by name, otherwise we assume a fixed column order:
 * name, grade, gender, phone, club, notes.
 */
export function parsePlayers(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { players: [], errors: ['No rows found.'] };

  let dataLines = lines;
  let map = { name: 0, first: -1, surname: -1, grade: 1, gender: 2, phone: 3, club: 4, notes: 5 };

  const headerCells = splitRow(lines[0]).map(normaliseHeader);
  const looksLikeHeader = headerCells.some((h) =>
    ['name', 'firstname', 'first', 'surname', 'lastname', 'grade', 'gender', 'sex', 'phone', 'mobile', 'club', 'notes', 'comments'].includes(h)
  );

  if (looksLikeHeader) {
    dataLines = lines.slice(1);
    const idx = (names: string[]) => headerCells.findIndex((h) => names.includes(h));
    map = {
      name: idx(['name', 'fullname']),
      first: idx(['firstname', 'first']),
      surname: idx(['surname', 'lastname', 'last']),
      grade: idx(['grade', 'division', 'level']),
      gender: idx(['gender', 'sex']),
      phone: idx(['phone', 'mobile', 'cell', 'number']),
      club: idx(['club']),
      notes: idx(['notes', 'comments', 'comment'])
    };
  }

  const players: ParsedPlayer[] = [];

  dataLines.forEach((line, i) => {
    const rowNo = looksLikeHeader ? i + 2 : i + 1;
    const cells = splitRow(line);
    const get = (n: number) => (n >= 0 && n < cells.length ? cells[n] : '');

    let name = get(map.name);
    if (!name && (map.first >= 0 || map.surname >= 0)) {
      name = [get(map.first), get(map.surname)].filter(Boolean).join(' ').trim();
    }
    if (!name) {
      errors.push(`Row ${rowNo}: missing name — skipped.`);
      return;
    }

    const grade = parseGrade(get(map.grade));
    if (grade === null) {
      errors.push(`Row ${rowNo} (${name}): grade must be D${GRADE_MIN}–D${GRADE_MAX} — skipped.`);
      return;
    }

    const gender = parseGender(get(map.gender));
    if (gender === null) {
      errors.push(`Row ${rowNo} (${name}): gender must be M or F — skipped.`);
      return;
    }

    players.push({
      name,
      grade,
      gender,
      phone: get(map.phone),
      club: get(map.club) || undefined,
      notes: get(map.notes) || undefined
    });
  });

  return { players, errors };
}
