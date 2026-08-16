import type { Gender, Player } from './types';
import { GRADE_MIN, GRADE_MAX, WTN_MIN, WTN_MAX } from './types';

export interface ParsedPlayer {
  name: string;
  /** Undefined when the source has no grade column, or the value was unusable. */
  grade?: number;
  /** World Tennis Number, when the source has one. Optional — never defaulted. */
  wtn?: number;
  /** Undefined when the source left gender blank, or the value was unrecognised. */
  gender?: Gender;
  phone: string;
  club?: string;
  notes?: string;
  /** Id from the source system (e.g. ClubSpark "Unique ID"), kept for traceability. */
  extId?: string;
}

export interface ParseResult {
  players: ParsedPlayer[];
  /** Rows that could not be imported at all. */
  errors: string[];
  /** Rows imported with something missing — grade or gender needs filling in. */
  warnings: string[];
}

/** CSV column order used by exports, and assumed for headerless input. */
export const CSV_HEADERS = ['Name', 'Grade', 'Gender', 'Phone', 'Club', 'Notes', 'External ID', 'WTN'] as const;

/* ---------------------------------------------------------------- writing */

/** Anything with the shape we write out — a stored Player or a freshly parsed row. */
type RowLike = Partial<Pick<Player, 'name' | 'grade' | 'gender' | 'phone' | 'club' | 'notes' | 'extId' | 'wtn'>>;

function escapeCell(value: string | number | undefined, delimiter: string): string {
  // Inputs are single-line, but guard anyway so a stray newline can't split a row.
  const s = String(value ?? '').replace(/\r?\n/g, ' ');
  return s.includes(delimiter) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Widest a padded column is allowed to get, so one long note can't strand the rest. */
const PAD_LIMIT = 32;

interface WriteOptions {
  lineBreak?: string;
  /**
   * Pad every cell out to its column width. Cells are trimmed on the way back
   * in, so the padding is invisible to parsing — it only exists to line the
   * columns up on screen, where a tab alone puts them wherever the tab stops
   * happen to fall.
   */
  pad?: boolean;
}

/** Serialise rows in the column order of CSV_HEADERS. Missing values come out blank. */
export function rowsToText(rows: RowLike[], delimiter: string, options: WriteOptions = {}): string {
  const { lineBreak = '\r\n', pad = false } = options;
  const table = [
    CSV_HEADERS.slice() as string[],
    ...rows.map((p) =>
      [p.name, p.grade, p.gender, p.phone, p.club, p.notes, p.extId, p.wtn].map((c) =>
        escapeCell(c, delimiter)
      )
    )
  ];

  if (!pad) return table.map((cells) => cells.join(delimiter)).join(lineBreak);

  const widths = CSV_HEADERS.map((_, i) =>
    Math.min(PAD_LIMIT, Math.max(...table.map((cells) => cells[i].length)))
  );
  return table
    .map((cells) =>
      cells
        .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i])))
        .join(delimiter)
        // Trailing padding on an otherwise empty tail serves no purpose.
        .replace(/\s+$/, '')
    )
    .join(lineBreak);
}

/** Serialise the directory to CSV for download. */
export function playersToCsv(players: Player[]): string {
  return rowsToText(players, ',');
}

/* ---------------------------------------------------------------- reading */

/**
 * Split CSV/TSV text into records (RFC 4180). Quoted fields may contain the
 * delimiter, escaped quotes and newlines, so we scan characters rather than
 * splitting on lines first.
 */
function parseRecords(src: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) records.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) endCell();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) endRow();

  return records;
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Column aliases, matched exactly against normalised headers. Exact matching is
 * deliberate: a loose "contains" match would pull "Emergency phone number" into
 * phone, or ClubSpark's "Age" into grade.
 */
const ALIASES = {
  name: ['name', 'fullname', 'playername'],
  first: ['firstname', 'first', 'givenname', 'forename'],
  surname: ['surname', 'lastname', 'last', 'familyname'],
  grade: ['grade', 'division', 'level', 'rating'],
  wtn: ['wtn', 'worldtennisnumber', 'tennisnumber'],
  gender: ['gender', 'sex'],
  mobile: ['mobilenumber', 'mobile', 'mobilephone', 'cellnumber', 'cell'],
  phone: ['phonenumber', 'phone', 'telephone', 'tel', 'contactnumber', 'number', 'homenumber', 'homephone'],
  work: ['worknumber', 'workphone'],
  club: ['club', 'clubname'],
  notes: ['notes', 'note', 'comments', 'comment'],
  extId: ['externalid', 'uniqueid', 'memberid', 'playerid']
} as const;

type Field = keyof typeof ALIASES;
type ColumnMap = Record<Field, number>;

/** Column order assumed when the text has no recognisable header row. */
const POSITIONAL: ColumnMap = {
  name: 0, first: -1, surname: -1, grade: 1, gender: 2, phone: 3, club: 4, notes: 5, extId: 6, wtn: 7,
  mobile: -1, work: -1
};

function mapColumns(headers: string[]): ColumnMap | null {
  const known = new Set(Object.values(ALIASES).flat() as string[]);
  if (!headers.some((h) => known.has(h))) return null;

  const map = {} as ColumnMap;
  for (const field of Object.keys(ALIASES) as Field[]) {
    map[field] = ALIASES[field].reduce<number>(
      (found, alias) => (found >= 0 ? found : headers.indexOf(alias)),
      -1
    );
  }
  return map;
}

/** ClubSpark wraps ids and phone numbers in square brackets: [0223035880]. */
function unwrap(raw: string): string {
  const v = raw.trim();
  return v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1).trim() : v;
}

function cleanPhone(raw: string): string {
  return unwrap(raw).replace(/\s+/g, '');
}

/**
 * Fix casing on names that arrive all-lower or all-upper ("watson", "NESA"),
 * leaving anything already mixed-case alone so "McEwen" survives.
 */
function tidyName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part && (part === part.toLowerCase() || part === part.toUpperCase())
            ? part[0].toUpperCase() + part.slice(1).toLowerCase()
            : part
        )
        .join('-')
    )
    .join(' ');
}

function parseGender(raw: string): Gender | null {
  const v = raw.trim().toLowerCase();
  if (['m', 'male', 'man', 'men'].includes(v)) return 'M';
  if (['f', 'female', 'woman', 'women', 'w'].includes(v)) return 'F';
  return null;
}

/** World Tennis Number: 40.0 down to 1.0, one decimal place. */
function parseWtn(raw: string): number | null {
  const m = raw.trim().match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n < WTN_MIN || n > WTN_MAX) return null;
  return Math.round(n * 10) / 10;
}

function parseGrade(raw: string): number | null {
  const m = raw.trim().toUpperCase().match(/D?\s*(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < GRADE_MIN || n > GRADE_MAX) return null;
  return n;
}

/**
 * Parse pasted text or an exported CSV into players. The first row may be a
 * header; if it names known columns we map by name, otherwise we assume the
 * fixed column order in CSV_HEADERS.
 *
 * Only a missing name drops a row. A missing grade or gender is reported as a
 * warning and left undefined, because club systems (ClubSpark among them) carry
 * no playing grade at all — the caller decides what to default them to.
 */
export function parsePlayers(text: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Strip a BOM, then sniff the delimiter from the header line only — deciding
  // per line lets one stray tab in a note change how that row is split.
  const src = text.replace(/^﻿/, '');
  const firstBreak = src.indexOf('\n');
  const firstLine = firstBreak >= 0 ? src.slice(0, firstBreak) : src;
  const records = parseRecords(src, firstLine.includes('\t') ? '\t' : ',');

  if (records.length === 0) return { players: [], errors: ['No rows found.'], warnings };

  const headers = records[0].map(normaliseHeader);
  const mapped = mapColumns(headers);
  const map = mapped ?? POSITIONAL;
  const dataRows = mapped ? records.slice(1) : records;

  const players: ParsedPlayer[] = [];

  dataRows.forEach((cells, i) => {
    const rowNo = mapped ? i + 2 : i + 1;
    const get = (n: number) => (n >= 0 && n < cells.length ? cells[n] : '');

    let name = tidyName(get(map.name));
    if (!name && (map.first >= 0 || map.surname >= 0)) {
      name = [tidyName(get(map.first)), tidyName(get(map.surname))].filter(Boolean).join(' ');
    }
    if (!name) {
      errors.push(`Row ${rowNo}: missing name — skipped.`);
      return;
    }

    const rawGrade = get(map.grade);
    const grade = parseGrade(rawGrade) ?? undefined;
    if (grade === undefined) {
      warnings.push(
        rawGrade
          ? `Row ${rowNo} (${name}): grade "${rawGrade}" is not D${GRADE_MIN}–D${GRADE_MAX}.`
          : `Row ${rowNo} (${name}): no grade in the file.`
      );
    }

    const rawGender = get(map.gender);
    const gender = parseGender(rawGender) ?? undefined;
    if (gender === undefined) {
      warnings.push(
        rawGender
          ? `Row ${rowNo} (${name}): gender "${rawGender}" not recognised.`
          : `Row ${rowNo} (${name}): no gender in the file.`
      );
    }

    // WTN is genuinely optional: a blank one is silent, only a bad value warns.
    const rawWtn = get(map.wtn);
    const wtn = parseWtn(rawWtn) ?? undefined;
    if (rawWtn && wtn === undefined) {
      warnings.push(`Row ${rowNo} (${name}): WTN "${rawWtn}" is not ${WTN_MIN}–${WTN_MAX}.`);
    }

    // Mobile is the most reliably filled column in club exports; work last.
    const phone = cleanPhone(get(map.mobile)) || cleanPhone(get(map.phone)) || cleanPhone(get(map.work));

    players.push({
      name,
      grade,
      wtn,
      gender,
      phone,
      club: get(map.club) || undefined,
      notes: get(map.notes) || undefined,
      extId: unwrap(get(map.extId)) || undefined
    });
  });

  return { players, errors, warnings };
}
