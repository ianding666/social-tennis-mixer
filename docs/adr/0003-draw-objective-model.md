# Draw objective model and priority

Generating a round happens in two stages with an explicit priority order, because the fairness goals genuinely conflict and a fixed ranking is needed to resolve them.

**Stage 1 — choose Byes:** candidates are the active players who have **played the most rounds so far** (equalising play time, which correctly favours late arrivals); among them, avoid anyone who Byed last round; break remaining ties randomly.

**Stage 2 — form Matches** among the playing players, in priority order:

1. **Hard:** honour the round's Pairing Mode (Balanced = grade-homogeneous courts; Mixed = strong-with-weak Pairs balanced by Combined Grade) and the court formats (Doubles, or Singles/Uneven on a spare court to keep Byes ≤ 1).
2. **Even within a tolerance:** sides must be within a small, configurable average-grade difference; the optimiser won't sacrifice beyond it.
3. **Gender Mode:** honour the round's chosen Gender Mode for every 2-player Pair — **Same** prefers same-gender Pairs (`MM`/`FF`) and keeps `MM` facing `MM`, `FF` facing `FF` (i.e. avoids `MM` vs `FF`); **Mixed** prefers mixed-gender Pairs (`MF`), which also makes `MM` vs `FF` impossible. Soft, only overridden when no even-enough alternative exists; Singles courts are exempt.
4. **Partner variety:** penalise repeating a partner already played with this session.
5. **Opponent variety:** then penalise repeating an opponent already faced.

Every input to the draw — Pairing Mode, Gender Mode, Rating Mode and both tolerances — is a **per-round** axis, stamped onto the Round when it is generated so it stays readable and redrawable later; the Session only holds the starting values a new round is seeded from. Fields a stored Round predates fall back to those Session values (Gender Mode reads as **Same**, Rating Mode as **grade**). The key trade-off: using an **evenness tolerance band** rather than strict lexicographic evenness is what allows "even matches" and "fresh partners each round" to coexist. The tolerances and the women's-style adjustments are left to the organiser (the latter handled by editing the entered Grade directly).
