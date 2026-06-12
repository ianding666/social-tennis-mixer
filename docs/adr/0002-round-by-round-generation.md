# Round-by-round draw generation

Only Round 1 is generated up-front. Each subsequent round is generated on demand from the **current active roster**, treating already-played or hand-edited rounds as fixed history that feeds variety and Bye-fairness calculations.

We chose this over generating the whole session up-front because late arrivals and no-shows are the norm at social play, which would make a pre-computed full draw stale almost immediately.

## Considered Options

- **Whole-session up-front** (rejected): produces a single printable sheet like the club's old Excel and allows globally-optimal fairness across all rounds, but assumes a fixed attendee list and can't gracefully absorb people arriving or leaving mid-session.

## Consequences

- Fairness (partner/opponent variety, equal play time) is optimised greedily from actual history rather than globally — good enough in practice, and honest about who was really present.
- A "regenerate this round" action can re-solve a round without disturbing earlier locked rounds.
