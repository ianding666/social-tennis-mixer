import { WTN_MAX, WTN_MIN } from './types';

/**
 * World Tennis Number lookup against the Tennis NZ results portal.
 *
 * There is no documented API; this is the endpoint the portal's own SPA calls
 * (results.matchpoint.kiwi → api.matchpoint.kiwi). It answers CORS with the
 * caller's origin reflected back, so the browser can reach it directly with no
 * proxy. Being undocumented, it can change without notice — every failure path
 * here degrades to "no number found" rather than blocking an import.
 */
const API = 'https://api.matchpoint.kiwi/results-api/wtn-rankings/rankings';

/** Concurrent requests. Deliberately modest: this is someone else's server. */
const CONCURRENCY = 4;

export type WtnStatus = 'matched' | 'none' | 'ambiguous' | 'error';

export interface WtnResult {
  status: WtnStatus;
  wtn?: number;
  /** Who we matched, for the ambiguous and matched cases. */
  candidates?: string[];
}

interface Attributes {
  fullName?: string;
  gender?: string;
  clubName?: string;
  wtnSingles?: string;
  wtnDoubles?: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The portal matches playerSearch as one literal substring of the full name, so
 * "Zarina (Sabrina) Alexander" finds nothing while "Zarina Alexander" finds her.
 * Drop parenthetical asides and collapse whitespace.
 */
export function searchName(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNumber(raw: string | undefined): number | undefined {
  const n = Number(raw);
  // 0.00 is how the portal reports "no rating", not a real number.
  if (!Number.isFinite(n) || n < WTN_MIN || n > WTN_MAX) return undefined;
  return Math.round(n * 10) / 10;
}

/**
 * Look up one player's doubles WTN. Only an exact full-name match counts; a
 * substring hit like "Agi Parkin" for "Agi Harmath-Parkin" is left alone,
 * because guessing here writes a wrong rating into the directory.
 */
export async function lookupDoublesWtn(
  name: string,
  gender: 'M' | 'F' | undefined,
  signal?: AbortSignal
): Promise<WtnResult> {
  const query = searchName(name);
  if (!query) return { status: 'none' };

  const url = `${API}/doubles?playerSearch=${encodeURIComponent(query)}&offset=0&limit=50`;

  let payload: { include?: { attributes?: Attributes }[] };
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { status: 'error', candidates: [`HTTP ${res.status}`] };
    payload = await res.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { status: 'error', candidates: [(e as Error).message] };
  }

  const rows = (payload.include ?? []).map((r) => r.attributes ?? {});
  let exact = rows.filter((r) => norm(r.fullName ?? '') === norm(query));

  // Two people can share a name; our own gender breaks the tie when we have one.
  if (exact.length > 1 && gender) {
    const byGender = exact.filter((r) => r.gender === gender);
    if (byGender.length) exact = byGender;
  }

  const label = (r: Attributes) => `${r.fullName} (${r.gender}, ${r.clubName ?? 'no club'})`;

  if (exact.length === 0) return { status: 'none' };
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact.map(label) };

  const wtn = parseNumber(exact[0].wtnDoubles);
  return wtn === undefined
    ? { status: 'none', candidates: [label(exact[0])] }
    : { status: 'matched', wtn, candidates: [label(exact[0])] };
}

export interface FillProgress {
  done: number;
  total: number;
  matched: number;
}

export interface FillSummary {
  matched: number;
  none: number;
  ambiguous: number;
  errors: number;
}

/**
 * Look up every row that has no WTN yet, mutating each row in place. Identical
 * names are only fetched once — club exports repeat people.
 */
export async function fillDoublesWtn<T extends { name: string; gender?: 'M' | 'F'; wtn?: number }>(
  rows: T[],
  options: {
    onProgress?: (p: FillProgress) => void;
    /** Fires once per row that actually completed — rows skipped by an abort never do. */
    onRow?: (row: T, result: WtnResult) => void;
    signal?: AbortSignal;
  } = {}
): Promise<FillSummary> {
  const { onProgress, onRow, signal } = options;
  const pending = rows.filter((r) => r.wtn === undefined);
  const cache = new Map<string, WtnResult>();
  const summary: FillSummary = { matched: 0, none: 0, ambiguous: 0, errors: 0 };

  let done = 0;
  const queue = pending.slice();

  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const row = queue.shift() as T;
      const key = `${norm(searchName(row.name))}|${row.gender ?? ''}`;

      let result = cache.get(key);
      if (!result) {
        try {
          result = await lookupDoublesWtn(row.name, row.gender, signal);
        } catch (e) {
          // Stopping is not a failure: end this worker and let the caller keep
          // everything that has already come back.
          if ((e as Error).name === 'AbortError') return;
          throw e;
        }
        cache.set(key, result);
      }

      if (result.status === 'matched') {
        row.wtn = result.wtn;
        summary.matched++;
      } else if (result.status === 'ambiguous') summary.ambiguous++;
      else if (result.status === 'error') summary.errors++;
      else summary.none++;

      onRow?.(row, result);
      done++;
      onProgress?.({ done, total: pending.length, matched: summary.matched });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}
