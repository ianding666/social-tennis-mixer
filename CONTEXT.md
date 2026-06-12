# Social Tennis Mixer

A pure client-side website for running Tennis Auckland Masters social tennis sessions. It imports attending players and generates balanced doubles draws across multiple rounds, re-mixing pairs and opponents each round while keeping play time fair.

## Language

**Grade**:
A player's playing strength, expressed as the Tennis Seniors division integer 2–12, where a lower number is stronger (a `D2` player is stronger than a `D12` player). The value entered by the organiser is used directly for all matching; if the organiser wants to account for relative strength (e.g. for a woman vs a same-graded man) they adjust the entered number themselves.
_Avoid_: Level, rating, skill, division (use "Grade").

**Gender**:
A player attribute (man / woman) used only to avoid an all-men Pair facing an all-women Pair. It has no effect on grade maths.

**Player**:
A known person in the Player Directory: Name, Grade, Gender, Phone (plus optional Club/Notes). Phone helps disambiguate people with similar names.

**Player Directory**:
The persistent master list of Players, kept in browser storage across all Sessions and exportable/importable as a file for backup or moving between computers. Sessions are built by searching the Directory by name or phone.

**Pair**:
A doubles team of two players for one round. Its strength is its **Combined Grade** = the sum of its two players' Grades.
_Avoid_: Team, partnership, doubles.

**Combined Grade**:
The sum of a Pair's two players' Grades; the measure used to compare two Pairs.

**Match**:
Two Pairs playing each other on one court for one round. A Match is **even** when the two Pairs' Combined Grades are as close as possible — the always-on objective of the draw. The draw also avoids an all-men Pair facing an all-women Pair (prefers mixed-gender Pairs).
_Avoid_: Game, fixture, tie.

**Match Format**:
How many players are on each side of a Match on a court:
- **Doubles** — 2v2, the default.
- **Singles** — 1v1, used to absorb 2 leftover players onto a spare court.
- **Uneven** — 1v2, used to absorb 3 leftover players onto a spare court.

**Pairing Mode**:
Chosen per round, governs how partners are formed within even Matches:
- **Balanced** — partners are close in grade to each other (e.g. a `D6` with a `D7`).
- **Mixed** — partners may differ widely in grade (strong + weak), provided the Match is still even.

**Session**:
A single social play event (e.g. "16 May"), roughly 3 hours, run on a configurable number of courts (default 5) and divided into Rounds. Its attendees are selected from the Player Directory, and it snapshots each player's Grade at the time they are added.

**Round**:
One block of simultaneous Matches across the courts, a configurable length (default 45 minutes). Players not in a Match that Round take a Bye.

**Bye**:
A player sitting out a Round because attendance can't fill the courts evenly. The draw minimises Byes — at most one player Byes unless all courts are already full. A player who is simply absent that Round (not yet arrived, or already left) is not on a Bye; they are just not in the Round's pool.

## Example dialogue

> **Organiser:** I've pulled 17 players from the Directory for tonight — five courts.
>
> **Dev:** Five courts is 20 Doubles slots, but you've got 17. Four Doubles uses 16; the 17th can't form a side, so one player takes a Bye. If it were 18 we'd open a fifth court as a Singles instead, and at 19 as an Uneven 1-v-2 — we only leave someone out when exactly one player is left over.
>
> **Organiser:** Fine. Make this round Balanced.
>
> **Dev:** So I group the four closest Grades onto each court — everyone on a court is similar, partners are similar, and the Match is even. Next round you might switch to Mixed, where I deliberately put a strong player with a weak one and balance the two Pairs by Combined Grade instead.
>
> **Organiser:** Whoever Byes tonight, don't make it the same person twice.
>
> **Dev:** Right — the Bye goes to whoever's played the most rounds so far, and I skip anyone who Byed last round. That also means if someone arrives at Round 3 they'll play, not sit, until their play count catches up.
>
> **Organiser:** And don't end up with the two guys against the two women.
>
> **Dev:** That only comes up on a court of two men and two women — I'll pair them mixed, MF versus MF, unless that's the only way to keep the Match even.
