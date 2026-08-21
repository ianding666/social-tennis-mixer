import { useState } from 'react';
import type { CSSProperties } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  style?: CSSProperties;
  onChange: (value: number) => void;
}

/**
 * A whole-number box that can be emptied. Clearing it to type a new number
 * leaves the field blank instead of snapping back to the minimum on the first
 * keystroke; the value is only forced into range when focus leaves the box.
 */
export default function CountInput({ value, min = 1, max = 20, disabled, style, onChange }: Props) {
  /** What is in the box while it is being edited; null once it agrees with `value`. */
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));

  return (
    <input
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      style={style}
      value={draft ?? value}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Commit as you type, but only once the box holds a number we can use —
        // an empty or half-typed box leaves the last committed value alone.
        const n = Number(raw);
        if (raw !== '' && Number.isFinite(n) && n >= min) onChange(clamp(n));
      }}
      onBlur={() => {
        if (draft === null) return;
        const n = Number(draft);
        onChange(draft !== '' && Number.isFinite(n) ? clamp(n) : min);
        setDraft(null);
      }}
    />
  );
}
