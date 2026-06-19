interface Props {
  onClose: () => void;
}

export default function RulesModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Matching Rules</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="muted small">
          Grade is the Tennis Seniors division 2–12 (lower = stronger) and is used exactly as entered.
          Gender is used to honour the round's Gender mode (same-gender or mixed Pairs).
        </p>

        <h3>Each round is built in two stages</h3>

        <h4>1. Who sits out (Byes)</h4>
        <ol>
          <li>
            Courts are filled with <strong>doubles first</strong>. If 2 or 3 players are left over and a
            court is free, that court runs as a <strong>singles (1v1)</strong> or <strong>uneven (1v2)</strong>{' '}
            match so nobody misses out.
          </li>
          <li>
            A player only takes a <strong>Bye</strong> when exactly one person is left over, or when every
            court is already full.
          </li>
          <li>
            Byes go to whoever has <strong>played the most rounds</strong> so far (so late arrivals get to
            play), avoiding anyone who sat out last round, with ties broken at random.
          </li>
        </ol>

        <h4>2. How the playing players are matched</h4>
        <ol>
          <li>
            <strong>Pairing mode</strong> (chosen per round):
            <ul>
              <li>
                <strong>Balanced</strong> — four similar-grade players share a court; partners are close in
                grade.
              </li>
              <li>
                <strong>Mixed</strong> — partners are deliberately strong + weak, with the two pairs balanced
                so the match is still even.
              </li>
            </ul>
          </li>
          <li>
            <strong>Even matches</strong> — the two sides are kept within a small average-grade tolerance.
            This is the top priority.
          </li>
          <li>
            <strong>Gender mode</strong> (chosen per round) — <strong>Same gender</strong> pairs two
            men or two women together (and keeps men's Pairs facing men's, women's facing women's);{' '}
            <strong>Mixed gender</strong> pairs one man with one woman. Soft: only overridden when no
            even-enough alternative exists.
          </li>
          <li>
            <strong>Fresh partners</strong> — avoid repeating partners played with earlier in the session.
          </li>
          <li>
            <strong>Fresh opponents</strong> — then avoid repeating opponents already faced.
          </li>
        </ol>

        <p className="muted small">
          Only Round 1 is generated up front; generate each later round once you know who is present. You can
          always swap any two players by hand afterwards — your edits feed into the next round's fairness.
        </p>
      </div>
    </div>
  );
}
