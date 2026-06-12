interface Props {
  onClose: () => void;
}

export default function GettingStartedModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Getting Started</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <h3>1. Add your players</h3>
        <p>
          Go to <strong>Player Directory</strong> and add each player with their name, grade, and gender.
          Grade is the Tennis Seniors division number (2–12; lower = stronger). Players are saved
          permanently in your browser so you only need to do this once.
        </p>

        <h3>2. Create a session</h3>
        <p>
          Go to <strong>Sessions</strong> and click <strong>New Session</strong>. Give it a name and date,
          then select which players are attending today.
        </p>

        <h3>3. Generate rounds</h3>
        <p>
          Inside a session, click <strong>Generate Round</strong> to create the first round of court
          matchups. The app automatically balances grades, avoids repeat partners, and handles byes when
          player numbers are uneven.
        </p>

        <h3>4. Adjust if needed</h3>
        <p>
          You can swap any two players on a court by hand before locking in the round. Each round is
          generated one at a time — generate the next round once you know who is still present.
        </p>

        <h3>5. Print the draw</h3>
        <p>
          Use your browser's print function to print the draw for the noticeboard. The nav and buttons are
          automatically hidden in the printed view.
        </p>

        <p className="muted small">
          For details on how the matching algorithm works, see <strong>Matching Rules</strong>.
        </p>
      </div>
    </div>
  );
}
