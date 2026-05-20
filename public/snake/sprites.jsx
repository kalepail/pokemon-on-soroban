// Custom creature sprites — for creatures we want to draw ourselves
// (rather than using a Stellar icon). Each returns a React node.

function SparkoSprite() {
  // Original electric-mouse-type creature in the Stellar style:
  // flat yellow body, lilac accents, black 1px outlines, big round eyes,
  // pointed ears with lilac tips, and a lightning-bolt antenna.
  return (
    <div className="stellar-icon">
      <svg viewBox="0 0 220 220" preserveAspectRatio="xMidYMid meet">
        {/* shadow under feet */}
        <ellipse cx="110" cy="190" rx="48" ry="6"
          style={{ fill: "var(--ic-lilac)", opacity: 0.5 }} />

        {/* lightning antenna on head */}
        <polygon points="118,18 104,52 118,52 100,86 142,46 122,46 134,18"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3, strokeLinejoin: "round" }} />

        {/* left ear */}
        <path d="M58,72 L40,30 L78,58 Z"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3, strokeLinejoin: "round" }} />
        {/* left ear inner tip */}
        <path d="M50,46 L46,34 L60,48 Z"
          style={{ fill: "var(--ic-lilac)", stroke: "var(--ic-stroke)", strokeWidth: 2, strokeLinejoin: "round" }} />

        {/* right ear */}
        <path d="M160,72 L178,30 L140,58 Z"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3, strokeLinejoin: "round" }} />
        {/* right ear inner tip */}
        <path d="M168,46 L172,34 L158,48 Z"
          style={{ fill: "var(--ic-lilac)", stroke: "var(--ic-stroke)", strokeWidth: 2, strokeLinejoin: "round" }} />

        {/* body — rounded squash */}
        <path d="M50,110
                 C50,82 78,68 110,68
                 C142,68 170,82 170,110
                 C170,150 150,180 110,180
                 C70,180 50,150 50,110 Z"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3, strokeLinejoin: "round" }} />

        {/* lilac accent cheek-marks (NOT red circles — diamond-style) */}
        <path d="M72,128 L80,124 L80,140 L72,144 Z"
          style={{ fill: "var(--ic-lilac)", stroke: "var(--ic-stroke)", strokeWidth: 2, strokeLinejoin: "round" }} />
        <path d="M148,128 L140,124 L140,140 L148,144 Z"
          style={{ fill: "var(--ic-lilac)", stroke: "var(--ic-stroke)", strokeWidth: 2, strokeLinejoin: "round" }} />

        {/* eyes — big and round */}
        <circle cx="92" cy="108" r="11"
          style={{ fill: "var(--ic-stroke)" }} />
        <circle cx="128" cy="108" r="11"
          style={{ fill: "var(--ic-stroke)" }} />
        {/* eye highlights */}
        <circle cx="89" cy="104" r="3.5"
          style={{ fill: "var(--ic-white)" }} />
        <circle cx="125" cy="104" r="3.5"
          style={{ fill: "var(--ic-white)" }} />

        {/* mouth — open smile with a tiny tongue */}
        <path d="M100,140 Q110,150 120,140 Q110,158 100,140 Z"
          style={{ fill: "var(--ic-stroke)", stroke: "var(--ic-stroke)", strokeWidth: 2, strokeLinejoin: "round" }} />
        <path d="M104,148 Q110,154 116,148 Q110,156 104,148 Z"
          style={{ fill: "var(--ic-lilac)" }} />

        {/* arms — little stubs */}
        <ellipse cx="56" cy="146" rx="10" ry="14"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3 }} />
        <ellipse cx="164" cy="146" rx="10" ry="14"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3 }} />

        {/* feet */}
        <ellipse cx="86" cy="178" rx="16" ry="8"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3 }} />
        <ellipse cx="134" cy="178" rx="16" ry="8"
          style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 3 }} />

        {/* a couple spark dots around it */}
        <circle cx="32"  cy="86"  r="3" style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 1.5 }} />
        <circle cx="190" cy="100" r="3" style={{ fill: "var(--ic-yellow)", stroke: "var(--ic-stroke)", strokeWidth: 1.5 }} />
        <circle cx="40"  cy="160" r="2" style={{ fill: "var(--ic-lilac)",  stroke: "var(--ic-stroke)", strokeWidth: 1.5 }} />
      </svg>
    </div>
  );
}

// Dispatch: render either a Stellar icon by idx, or a custom sprite by id.
function CreatureSprite({ creature }) {
  if (!creature) return null;
  if (creature.customSprite === "sparko") return <SparkoSprite />;
  return <window.StellarIcon idx={creature.iconIdx} />;
}

window.SparkoSprite = SparkoSprite;
window.CreatureSprite = CreatureSprite;
