export function uid(): string {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
  );
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Names compared for identity: case and inner spacing do not count. */
export function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Phone numbers compared for identity: only the digits count. */
export function phoneDigits(s: string | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
