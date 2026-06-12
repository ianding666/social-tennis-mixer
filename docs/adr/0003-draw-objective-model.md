# Draw objective model and priority

Generating a round happens in two stages with an explicit priority order, because the fairness goals genuinely conflict and a fixed ranking is needed to resolve them.

**Stage 1 — choose Byes:** candidates are the active players who have **played the most rounds so far** (equalising play time, which correctly favours late arrivals); among them, avoid anyone who Byed last round; break remaining ties randomly.

**Stage 2 — form Matches** among the playing players, in priority order:

1. **Hard:** honour the round's Pairing Mode (Balanced = grade-homogeneous courts; Mixed = strong-with-weak Pairs balanced by Combined Grade) and the court formats (Doubles, or Singles/Uneven on a spare court to keep Byes ≤ 1).
2. **Even within a tolerance:** sides must be within a small, configurable average-grade difference; the optimiser won't sacrifice beyond it.
3. **Avoid `MM` vs `FF`:** prefer mixed-gender Pairs; soft, only overridden when no even-enough alternative exists.
4. **Partner variety:** penalise repeating a partner already played with this session.
5. **Opponent variety:** then penalise repeating an opponent already faced.

The key trade-off: using an **evenness tolerance band** rather than strict lexicographic evenness is what allows "even matches" and "fresh partners each round" to coexist. The tolerance and the women's-style adjustments are left to the organiser (the latter handled by editing the entered Grade directly).
