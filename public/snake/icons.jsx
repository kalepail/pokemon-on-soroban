// Loads Icons.svg once, exposes <StellarIcon idx={N}> React component
// The big SVG has all icons in a 7x10 grid; we crop with a viewBox into a hidden sprite.

window.__iconManifest = [
  { i: 0,  vx: 60,   vy: 170,  size: 220 },
  { i: 1,  vx: 325,  vy: 170,  size: 220 },
  { i: 2,  vx: 590,  vy: 170,  size: 220 },
  { i: 3,  vx: 850,  vy: 170,  size: 220 },
  { i: 4,  vx: 1110, vy: 170,  size: 220 },
  { i: 5,  vx: 1370, vy: 170,  size: 220 },
  { i: 6,  vx: 1625, vy: 170,  size: 220 },
  { i: 7,  vx: 60,   vy: 450,  size: 220 },
  { i: 8,  vx: 325,  vy: 450,  size: 220 },
  { i: 9,  vx: 590,  vy: 450,  size: 220 },
  { i: 10, vx: 850,  vy: 450,  size: 220 },
  { i: 11, vx: 1110, vy: 450,  size: 220 },
  { i: 12, vx: 1370, vy: 450,  size: 220 },
  { i: 13, vx: 1625, vy: 450,  size: 220 },
  { i: 14, vx: 60,   vy: 730,  size: 220 },
  { i: 15, vx: 325,  vy: 730,  size: 220 },
  { i: 16, vx: 590,  vy: 730,  size: 220 },
  { i: 17, vx: 850,  vy: 730,  size: 220 },
  { i: 18, vx: 1110, vy: 730,  size: 220 },
  { i: 19, vx: 1370, vy: 730,  size: 220 },
  { i: 20, vx: 1625, vy: 730,  size: 220 },
  { i: 21, vx: 60,   vy: 1010, size: 220 },
  { i: 22, vx: 325,  vy: 1010, size: 220 },
  { i: 23, vx: 590,  vy: 1010, size: 220 },
  { i: 24, vx: 850,  vy: 1010, size: 220 },
  { i: 25, vx: 1110, vy: 1010, size: 220 },
  { i: 26, vx: 1370, vy: 1010, size: 220 },
  { i: 27, vx: 1625, vy: 1010, size: 220 },
  { i: 28, vx: 60,   vy: 1290, size: 220 },
  { i: 29, vx: 325,  vy: 1290, size: 220 },
  { i: 30, vx: 590,  vy: 1290, size: 220 },
  { i: 31, vx: 850,  vy: 1290, size: 220 },
  { i: 32, vx: 1110, vy: 1290, size: 220 },
  { i: 33, vx: 1370, vy: 1290, size: 220 },
  { i: 34, vx: 1625, vy: 1290, size: 220 },
  { i: 35, vx: 60,   vy: 1570, size: 220 },
  { i: 36, vx: 325,  vy: 1570, size: 220 },
  { i: 37, vx: 590,  vy: 1570, size: 220 },
  { i: 38, vx: 850,  vy: 1570, size: 220 },
  { i: 39, vx: 1110, vy: 1570, size: 220 },
  { i: 40, vx: 1370, vy: 1570, size: 220 },
  { i: 41, vx: 1625, vy: 1570, size: 220 },
  { i: 42, vx: 60,   vy: 1850, size: 220 },
  { i: 43, vx: 325,  vy: 1850, size: 220 },
  { i: 44, vx: 590,  vy: 1850, size: 220 },
  { i: 45, vx: 850,  vy: 1850, size: 220 },
  { i: 46, vx: 1110, vy: 1850, size: 220 },
  { i: 47, vx: 1370, vy: 1850, size: 220 },
  { i: 48, vx: 1625, vy: 1850, size: 220 },
  { i: 49, vx: 60,   vy: 2130, size: 220 },
  { i: 50, vx: 325,  vy: 2130, size: 220 },
  { i: 51, vx: 590,  vy: 2130, size: 220 },
  { i: 52, vx: 850,  vy: 2130, size: 220 },
  { i: 53, vx: 1110, vy: 2130, size: 220 },
  { i: 54, vx: 1370, vy: 2130, size: 220 },
  { i: 55, vx: 1625, vy: 2130, size: 220 },
  { i: 56, vx: 60,   vy: 2410, size: 220 },
  { i: 57, vx: 325,  vy: 2410, size: 220 },
  { i: 58, vx: 590,  vy: 2410, size: 220 },
  { i: 59, vx: 850,  vy: 2410, size: 220 },
];

// Load the SVG once and inject a hidden master copy.
async function loadIconSprite() {
  if (window.__iconSpriteLoaded) return window.__iconSpriteLoaded;
  window.__iconSpriteLoaded = (async () => {
    const r = await fetch("assets/Icons.svg");
    const text = await r.text();
    // Parse SVG, strip outer <svg> wrapper, keep contents
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    const root = doc.documentElement;

    // Mutate elements: convert class-based color to inline style with CSS vars.
    // var() in inline style cascades through <use> shadow trees; class selectors don't.
    const FILL = {
      st23: "var(--ic-yellow)", st33: "var(--ic-yellow)",
      st19: "var(--ic-yellow)", st47: "var(--ic-yellow)",
      st29: "var(--ic-lilac)",  st34: "var(--ic-lilac)",
      st27: "var(--ic-white)",  st30: "var(--ic-white)",
      st35: "var(--ic-black)",
    };
    const STROKE_ONLY = new Set([
      "st2","st3","st4","st5","st6","st13","st14","st16","st17","st18",
      "st26","st28","st31","st12","st8",
    ]);
    root.querySelectorAll("[class]").forEach((el) => {
      const cls = (el.getAttribute("class") || "").split(/\s+/);
      for (const c of cls) {
        if (FILL[c]) {
          el.setAttribute(
            "style",
            `fill:${FILL[c]};stroke:var(--ic-stroke);stroke-width:1.5px;`
          );
          return;
        }
        if (STROKE_ONLY.has(c)) {
          el.setAttribute(
            "style",
            `fill:none;stroke:var(--ic-stroke);stroke-width:1.5px;`
          );
          return;
        }
        if (c === "st0") {
          el.setAttribute("style", "fill:transparent;stroke:none;");
          return;
        }
      }
    });

    const innerHTML = root.innerHTML;
    // Create a hidden sprite SVG containing the same contents wrapped in a <g id="icon-master">
    const host = document.createElement("div");
    host.style.cssText = "position:absolute; width:0; height:0; overflow:hidden; pointer-events:none;";
    host.setAttribute("aria-hidden", "true");
    // Inject a <style> inside the SVG so class rules apply to <use> shadow trees.
    // CSS variables resolve against the use site's host.
    const ICON_STYLE = `
      .st23, .st33, .st19, .st47 { fill: var(--ic-yellow, #FDDA24); stroke: var(--ic-stroke, #0F0F0F); stroke-width: 1.5px; }
      .st29, .st34 { fill: var(--ic-lilac, #B7ACE8); stroke: var(--ic-stroke, #0F0F0F); stroke-width: 1.5px; }
      .st27, .st30 { fill: var(--ic-white, #FFFFFF); stroke: var(--ic-stroke, #0F0F0F); stroke-width: 1.5px; }
      .st35 { fill: var(--ic-black, #0F0F0F); }
      .st2, .st3, .st4, .st5, .st6, .st13, .st14, .st16, .st17, .st18,
      .st26, .st28, .st31, .st12, .st8 { stroke: var(--ic-stroke, #0F0F0F); stroke-width: 1.5px; fill: none; }
      .st0 { fill: transparent; stroke: none; }
    `;
    host.innerHTML = `
      <svg id="icon-sprite-master" viewBox="0 0 1920 3047" xmlns="http://www.w3.org/2000/svg" style="position:absolute;">
        <style>${ICON_STYLE}</style>
        <g id="icon-master">${innerHTML}</g>
      </svg>
    `;
    document.body.appendChild(host);
    return true;
  })();
  return window.__iconSpriteLoaded;
}

// Component: render a single icon by its index.
// Internally creates an SVG with viewBox cropped to the icon's region,
// containing a <use href="#icon-master" /> reference.
function StellarIcon({ idx, padding = 0 }) {
  const meta = window.__iconManifest.find(m => m.i === idx) || window.__iconManifest[0];
  const pad = padding;
  const vb = `${meta.vx - pad} ${meta.vy - pad} ${meta.size + pad * 2} ${meta.size + pad * 2}`;
  return (
    <div className="stellar-icon">
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet">
        <use href="#icon-master" />
      </svg>
    </div>
  );
}

window.StellarIcon = StellarIcon;
window.loadIconSprite = loadIconSprite;
