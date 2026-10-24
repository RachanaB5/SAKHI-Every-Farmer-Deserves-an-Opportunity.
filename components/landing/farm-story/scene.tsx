// The artwork for the farm-to-table story: layered SVG characters (a farmer,
// a home cook and a cheeky tomato), a small vegetable garden and a cosy
// kitchen. Every moving part carries a `data-p` id that pose.ts drives; the
// static shapes here never change. Painted in a soft, rounded storybook
// style with its own sky and ground so it reads the same in light and dark
// site themes.
import { ARM, WORLD } from "./pose";

const { ground: G } = WORLD;
const PLANT_X = 575;
const BOARD_X = 1235;
const COUNTER_TOP = G - 180;
const PAN_X = 1665;

const INK = "#3b2a22";

/**
 * Deterministic 0–1 noise so the hand-scattered texture (grass, soil) is identical on every render.
 * Rounded, because Math.sin can differ in its last digits between Node and the browser, which would
 * make the server-rendered and client attributes disagree.
 */
const noise = (i: number) => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return Math.round((v - Math.floor(v)) * 1000) / 1000;
};
/** Rounds a computed coordinate so SVG attributes are stable strings. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A reusable pair of eyes: whites, a pupil group that looks around, and highlights. */
function Eyes({ id, lidId, spread, pupil, iris, ry = 19 }: { id?: string; lidId: string; spread: number; pupil: number; iris: string; ry?: number }) {
  return (
    <g data-p={id}>
      <g data-p={lidId}>
        <ellipse cx={-spread} cy={-6} rx={15} ry={ry} fill="#fff" />
        <ellipse cx={spread} cy={-6} rx={15} ry={ry} fill="#fff" />
        {/* the lid casts a soft shadow on the top of the eye */}
        <ellipse cx={-spread} cy={-6 - ry * 0.55} rx={14} ry={ry * 0.5} fill="#7a4a30" opacity={0.1} />
        <ellipse cx={spread} cy={-6 - ry * 0.55} rx={14} ry={ry * 0.5} fill="#7a4a30" opacity={0.1} />
        <g data-p={lidId.replace("lids", "pupils")}>
          {[-spread, spread].map((x) => (
            <g key={x}>
              <circle cx={x} cy={-4} r={pupil} fill={iris} />
              <circle cx={x} cy={-4} r={pupil * 0.55} fill="#1b130f" />
              <circle cx={x - 3.5} cy={-9} r={3.4} fill="#fff" />
              <circle cx={x + 3} cy={0} r={1.6} fill="#fff" opacity={0.8} />
            </g>
          ))}
        </g>
        {[-spread, spread].map((x) => (
          <path key={x} d={`M${x - 16.5} -4 Q${x} ${-8 - ry * 1.5} ${x + 16.5} -4`} stroke={INK} strokeWidth={3.6} strokeLinecap="round" fill="none" />
        ))}
      </g>
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="fs-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#bfe3f5" />
        <stop offset="0.7" stopColor="#e6f2f6" />
        <stop offset="1" stopColor="#eef4ef" />
      </linearGradient>
      <linearGradient id="fs-grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8cc152" />
        <stop offset="1" stopColor="#5f9a3a" />
      </linearGradient>
      <linearGradient id="fs-hill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b9d98a" />
        <stop offset="1" stopColor="#9bc66d" />
      </linearGradient>
      <linearGradient id="fs-skinF" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fbc9a8" />
        <stop offset="1" stopColor="#eea485" />
      </linearGradient>
      <linearGradient id="fs-skinC" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e3a674" />
        <stop offset="1" stopColor="#c98456" />
      </linearGradient>
      <linearGradient id="fs-denim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a6c2e2" />
        <stop offset="1" stopColor="#7c9fc9" />
      </linearGradient>
      <linearGradient id="fs-hat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6c895" />
        <stop offset="1" stopColor="#c9a56f" />
      </linearGradient>
      <linearGradient id="fs-teal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4c9aa9" />
        <stop offset="1" stopColor="#38808f" />
      </linearGradient>
      <radialGradient id="fs-tomato" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#ff7a5c" />
        <stop offset="0.55" stopColor="#e5372a" />
        <stop offset="1" stopColor="#b8241a" />
      </radialGradient>
      <linearGradient id="fs-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e2b57a" />
        <stop offset="1" stopColor="#c8955a" />
      </linearGradient>
      <pattern id="fs-plaid" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill="#94913f" />
        <rect y="0" width="30" height="12" fill="#5d5a22" opacity="0.5" />
        <rect x="0" width="12" height="30" fill="#5d5a22" opacity="0.5" />
        <rect y="16" width="30" height="3" fill="#d6d38a" opacity="0.35" />
        <rect x="16" width="3" height="30" fill="#d6d38a" opacity="0.35" />
      </pattern>
      {/* soft contact shadows, face and body shading (light comes from the upper left) */}
      <radialGradient id="fs-shadow">
        <stop offset="0" stopColor="#3a2410" stopOpacity="0.6" />
        <stop offset="0.6" stopColor="#3a2410" stopOpacity="0.25" />
        <stop offset="1" stopColor="#3a2410" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="fs-face" cx="0.34" cy="0.3" r="0.85">
        <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#7a3a18" stopOpacity="0.26" />
      </radialGradient>
      <linearGradient id="fs-body" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#1c1a08" stopOpacity="0.26" />
      </linearGradient>
      <linearGradient id="fs-ray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff6c8" stopOpacity="0.5" />
        <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="fs-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f3f8f6" stopOpacity="0" />
        <stop offset="1" stopColor="#f3f8f6" stopOpacity="0.75" />
      </linearGradient>
      <linearGradient id="fs-shaft" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fffbe6" stopOpacity="0.5" />
        <stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

function Backdrop() {
  return (
    <g>
      {/* sky and ground reach far past the frame so any aspect ratio stays filled */}
      <rect x={-2500} y={-2500} width={6800} height={2500 + G} fill="url(#fs-sky)" />
      {/* sun with a few soft rays */}
      {[-30, -8, 14, 36].map((a) => (
        <path key={a} d="M300 190 L270 800 L350 800Z" fill="url(#fs-ray)" opacity={0.35} transform={`rotate(${a} 300 190)`} />
      ))}
      <circle cx={300} cy={190} r={64} fill="#ffe39a" />
      <circle cx={300} cy={190} r={104} fill="#ffe39a" opacity={0.28} />
      <circle cx={300} cy={190} r={160} fill="#ffe39a" opacity={0.12} />
      <g data-p="clouds" fill="#fff" opacity={0.92}>
        {[
          [520, 150, 1],
          [980, 100, 0.8],
          [1380, 190, 1.1],
          [-120, 120, 0.9],
          [1700, 120, 0.8],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <ellipse cx={0} cy={0} rx={70} ry={24} />
            <ellipse cx={-34} cy={-14} rx={34} ry={26} />
            <ellipse cx={20} cy={-22} rx={40} ry={30} />
          </g>
        ))}
      </g>
      {/* far blue ridge, nearer green hills, a line of trees, then haze at the horizon (atmospheric depth) */}
      <path d="M-2500 600 C-1500 520 -900 590 -300 540 C200 500 600 580 1000 545 C1500 510 2300 590 4300 530 L4300 820 L-2500 820Z" fill="#b4cfd6" opacity={0.75} />
      <path d="M-2500 640 C-1200 560 -700 650 -200 600 C300 550 700 650 1100 610 C1500 570 2200 650 4300 590 L4300 820 L-2500 820Z" fill="url(#fs-hill)" opacity={0.85} />
      {/* a bushy tree line: overlapping rounded crowns on a solid base, so it reads as one band */}
      <rect x={-2500} y={G - 138} width={6800} height={80} fill="#86b45f" />
      {[...Array(40)].map((_, i) => {
        const x = r1(-320 + i * 70 + noise(i) * 30);
        const r = r1(28 + noise(i + 50) * 22);
        return <ellipse key={i} cx={x} cy={r1(G - 138 - noise(i + 9) * 14)} rx={r} ry={r1(r * 0.85)} fill={i % 3 ? "#86b45f" : "#7aa955"} />;
      })}
      <rect x={-2500} y={G - 250} width={6800} height={260} fill="url(#fs-haze)" />
      <rect x={-2500} y={G - 20} width={6800} height={2000} fill="url(#fs-grass)" />
      <ellipse cx={880} cy={G + 4} rx={1100} ry={16} fill="#4f8a31" opacity={0.35} />
      {/* blades of grass scattered along the front edge */}
      {[...Array(150)].map((_, i) => {
        const x = r1(-200 + noise(i + 200) * 2200);
        const y = r1(G + 6 + noise(i + 400) * 70);
        const h = r1(8 + noise(i + 600) * 12);
        return <path key={i} d={`M${x} ${y} q${r1((noise(i) - 0.5) * 8)} ${r1(-h * 0.6)} ${r1((noise(i + 3) - 0.5) * 10)} ${-h}`} stroke={i % 3 ? "#4f8a31" : "#a6d46a"} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.7} />;
      })}
    </g>
  );
}

function Garden() {
  return (
    <g>
      {/* soil bed */}
      <path d="M430 800 Q430 768 470 764 L720 764 Q770 768 770 800Z" fill="#8a5a3a" />
      <path d="M440 790 Q440 774 478 771 L716 771 Q752 774 760 790Z" fill="#a06c46" />
      {[...Array(46)].map((_, i) => (
        <circle key={i} cx={r1(445 + noise(i + 11) * 315)} cy={r1(774 + noise(i + 31) * 22)} r={r1(1.6 + noise(i + 5) * 1.6)} fill={i % 2 ? "#6e452a" : "#b98458"} opacity={0.6} />
      ))}
      <ellipse cx={PLANT_X + 20} cy={792} rx={70} ry={9} fill="url(#fs-shadow)" />
      {/* lettuces and carrot tops */}
      {[490, 680, 725].map((x, i) => (
        <g key={x} transform={`translate(${x} 770)`}>
          {i === 0 ? (
            <>
              <ellipse cx={0} cy={-8} rx={28} ry={20} fill="#6bb04a" />
              <ellipse cx={-10} cy={-14} rx={16} ry={14} fill="#82c75d" />
              <ellipse cx={11} cy={-12} rx={14} ry={12} fill="#5fa042" />
            </>
          ) : (
            <>
              <path d="M0 0 L-14 -42 M0 0 L0 -50 M0 0 L14 -40" stroke="#58a63a" strokeWidth={6} strokeLinecap="round" />
              <circle cx={0} cy={0} r={5} fill="#f08a2a" />
            </>
          )}
        </g>
      ))}
      {/* the tomato plant */}
      <g data-p="plant">
        <path d={`M${PLANT_X} 780 C${PLANT_X - 6} 700 ${PLANT_X + 10} 640 ${PLANT_X + 2} 548`} stroke="#4f8d34" strokeWidth={10} strokeLinecap="round" fill="none" />
        <path d={`M${PLANT_X + 2} 620 C${PLANT_X + 40} 600 ${PLANT_X + 66} 628 ${PLANT_X + 8} 640Z`} fill="#62ad40" />
        <path d={`M${PLANT_X} 680 C${PLANT_X - 50} 650 ${PLANT_X - 76} 690 ${PLANT_X - 6} 700Z`} fill="#58a03a" />
        <path d={`M${PLANT_X + 4} 570 C${PLANT_X + 44} 540 ${PLANT_X + 70} 576 ${PLANT_X + 6} 586Z`} fill="#6bb94a" />
        <path d={`M${PLANT_X - 2} 585 C${PLANT_X - 48} 560 ${PLANT_X - 70} 596 ${PLANT_X - 4} 604Z`} fill="#58a03a" />
        {/* the stalk the ripe tomato hangs from; a small knob is left once it's picked */}
        <path d={`M${PLANT_X + 4} 640 C${PLANT_X + 4} 620 ${PLANT_X + 4} 600 ${PLANT_X + 4} 592`} stroke="#4f8d34" strokeWidth={6} strokeLinecap="round" fill="none" />
        <circle data-p="stem-knob" cx={PLANT_X + 4} cy={592} r={6} fill="#3f7a2a" opacity={0} />
        {/* two green tomatoes still growing */}
        <circle cx={PLANT_X - 40} cy={660} r={17} fill="#9ccc5a" />
        <circle cx={PLANT_X + 44} cy={690} r={14} fill="#a8d463" />
      </g>
      {/* little fence */}
      {[790, 830, 870, 910].map((x) => (
        <rect key={x} x={x} y={738} width={16} height={62} rx={5} fill="#d9b684" />
      ))}
      <rect x={780} y={756} width={150} height={9} rx={4} fill="#c79e68" />
    </g>
  );
}

function Kitchen() {
  return (
    <g>
      {/* wall */}
      <rect x={1080} y={-2500} width={3200} height={2500 + COUNTER_TOP} fill="#eef1ee" />
      <rect x={1080} y={COUNTER_TOP - 170} width={3200} height={170} fill="#e1e8e3" />
      {[...Array(12)].map((_, i) => (
        <path key={i} d={`M${1080 + i * 80} ${COUNTER_TOP - 170} v170`} stroke="#d2dcd5" strokeWidth={3} />
      ))}
      <rect x={1080} y={-2500} width={14} height={2500 + G} fill="#cfd9d2" opacity={0.7} />
      {/* window */}
      <rect x={1500} y={300} width={190} height={170} rx={16} fill="#cfeaf6" stroke="#d9b684" strokeWidth={10} />
      <path d="M1595 300 v170 M1500 385 h190" stroke="#d9b684" strokeWidth={8} />
      <circle cx={1550} cy={345} r={20} fill="#fff" opacity={0.55} />
      {/* shelf with jars */}
      <rect x={1180} y={404} width={230} height={12} rx={5} fill="#c79e68" />
      {[1200, 1244, 1288, 1336].map((x, i) => (
        <g key={x}>
          <rect x={x} y={362} width={32} height={42} rx={8} fill={["#f4a259", "#e5534b", "#8fbf5a", "#f2d16b"][i]} opacity={0.92} />
          <rect x={x + 3} y={356} width={26} height={9} rx={3} fill="#a9774a" />
        </g>
      ))}
      {/* hanging utensils */}
      <path d="M1450 150 v160" stroke="#b78b57" strokeWidth={6} />
      <g fill="#b9c3c9">
        <rect x={1425} y={170} width={14} height={70} rx={7} />
        <circle cx={1432} cy={256} r={20} />
        <rect x={1458} y={176} width={14} height={86} rx={7} />
      </g>
      {/* counter */}
      <rect x={1100} y={COUNTER_TOP} width={3200} height={G - COUNTER_TOP + 30} fill="#c89a62" />
      <rect x={1100} y={COUNTER_TOP + 4} width={3200} height={G - COUNTER_TOP} fill="url(#fs-wood)" />
      {[1180, 1460, 1740].map((x) => (
        <g key={x}>
          <rect x={x} y={COUNTER_TOP + 30} width={250} height={116} rx={12} fill="#d9a96d" stroke="#bf8d55" strokeWidth={4} />
          <circle cx={x + 125} cy={COUNTER_TOP + 52} r={7} fill="#a9774a" />
        </g>
      ))}
      <rect x={1090} y={COUNTER_TOP - 12} width={3200} height={22} rx={8} fill="#f0e2c9" />
      <rect x={1090} y={COUNTER_TOP + 4} width={3200} height={8} fill="#000" opacity={0.08} />
      {[...Array(30)].map((_, i) => (
        <path key={i} d={`M${r1(1120 + i * 60 + noise(i) * 20)} ${COUNTER_TOP + 14 + (i % 4) * 8} h${r1(30 + noise(i + 2) * 40)}`} stroke="#a9774a" strokeWidth={2} strokeLinecap="round" opacity={0.28} />
      ))}
      {/* light from the window falls across the counter */}
      <path d="M1500 470 L1690 470 L1560 640 L1290 640Z" fill="url(#fs-shaft)" opacity={0.55} />
      <ellipse cx={BOARD_X + 10} cy={COUNTER_TOP - 6} rx={92} ry={8} fill="url(#fs-shadow)" />
      {/* cutting board */}
      <rect x={BOARD_X - 80} y={COUNTER_TOP - 22} width={160} height={14} rx={7} fill="#cf9a58" />
      <rect x={BOARD_X - 80} y={COUNTER_TOP - 22} width={160} height={7} rx={3.5} fill="#e5b778" />
      {/* hob + pan */}
      <rect x={PAN_X - 110} y={COUNTER_TOP - 24} width={220} height={14} rx={7} fill="#4a4a52" />
      <g data-p="pan">
        <ellipse cx={PAN_X} cy={COUNTER_TOP - 34} rx={78} ry={19} fill="#3a3a42" />
        <ellipse cx={PAN_X} cy={COUNTER_TOP - 38} rx={66} ry={14} fill="#55555e" />
        <g data-p="pan-food" opacity={0}>
          {[
            [-34, "#e5372a"],
            [-12, "#7ab648"],
            [10, "#f4b63e"],
            [32, "#e5372a"],
            [-2, "#f08a2a"],
          ].map(([dx, c], i) => (
            <ellipse key={i} cx={PAN_X + Number(dx)} cy={COUNTER_TOP - 40 + (i % 2) * 3} rx={13} ry={7} fill={String(c)} />
          ))}
        </g>
        <rect x={PAN_X - 150} y={COUNTER_TOP - 40} width={78} height={12} rx={6} fill="#2e2e35" />
      </g>
      {[0, 1, 2].map((i) => (
        <path key={i} data-p={`steam${i}`} d={`M${PAN_X - 30 + i * 30} ${COUNTER_TOP - 56} q-12 -16 0 -30 q12 -14 0 -28`} stroke="#fff" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0} />
      ))}
    </g>
  );
}

function Farmer() {
  return (
    <g data-p="f-body">
      {/* arm on the hip */}
      <path d="M-82 -262 C-128 -238 -132 -194 -86 -168" fill="none" stroke="url(#fs-plaid)" strokeWidth={36} strokeLinecap="round" />
      <path d="M-84 -170 C-72 -166 -64 -162 -56 -160" fill="none" stroke="url(#fs-skinF)" strokeWidth={26} strokeLinecap="round" />
      <circle cx={-52} cy={-158} r={17} fill="url(#fs-skinF)" />
      {/* legs */}
      <path d="M-62 -150 L-64 -30 Q-64 -14 -48 -14 L-12 -14 Q-2 -14 -2 -28 L-2 -150Z" fill="url(#fs-denim)" />
      <path d="M62 -150 L64 -30 Q64 -14 48 -14 L12 -14 Q2 -14 2 -28 L2 -150Z" fill="url(#fs-denim)" />
      <path d="M-64 -30 l8 10 l8 -10 l8 10 l10 -10 l10 10" stroke="#c3d5ea" strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d="M64 -30 l-8 10 l-8 -10 l-8 10 l-10 -10 l-10 10" stroke="#c3d5ea" strokeWidth={5} fill="none" strokeLinecap="round" />
      <rect x={24} y={-100} width={30} height={30} rx={5} fill="#c8a574" transform="rotate(-8 39 -85)" />
      <path d="M28 -96 l22 22 M50 -96 l-22 22" stroke="#8a6a44" strokeWidth={2.5} transform="rotate(-8 39 -85)" />
      {/* boots */}
      <path d="M-74 0 Q-80 -26 -60 -32 L-16 -32 Q-2 -28 -2 -14 L-2 0Z" fill="#a8683a" />
      <path d="M74 0 Q80 -26 60 -32 L16 -32 Q2 -28 2 -14 L2 0Z" fill="#a8683a" />
      <rect x={-76} y={-5} width={74} height={7} rx={3} fill="#6e4325" />
      <rect x={2} y={-5} width={74} height={7} rx={3} fill="#6e4325" />
      {/* leg and body shading */}
      <path d="M-62 -150 L-64 -30 Q-64 -14 -48 -14 L-12 -14 Q-2 -14 -2 -28 L-2 -150Z" fill="url(#fs-body)" />
      <path d="M62 -150 L64 -30 Q64 -14 48 -14 L12 -14 Q2 -14 2 -28 L2 -150Z" fill="url(#fs-body)" />
      <path d="M-40 -110 q14 6 28 -2 M20 -108 q14 6 30 -2 M-44 -64 q12 5 26 -1" stroke="#41618a" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.28} />
      {/* neck, shaded under the chin */}
      <rect x={-22} y={-300} width={44} height={36} rx={14} fill="url(#fs-skinF)" />
      {/* shirt + overalls */}
      <rect x={-82} y={-288} width={164} height={152} rx={54} fill="url(#fs-plaid)" />
      <rect x={-82} y={-288} width={164} height={152} rx={54} fill="url(#fs-body)" />
      <path d="M-22 -288 L0 -262 L22 -288" fill="#7d7b33" stroke="#55511e" strokeWidth={3} strokeLinejoin="round" />
      <path d="M-60 -236 L60 -236 L64 -140 L-64 -140Z" fill="url(#fs-denim)" />
      <path d="M-60 -236 L60 -236 L64 -140 L-64 -140Z" fill="url(#fs-body)" />
      <path d="M-56 -228 L56 -228 M-58 -146 L58 -146" stroke="#fff" strokeWidth={2.5} strokeDasharray="6 5" opacity={0.5} />
      <rect x={-34} y={-216} width={68} height={48} rx={10} fill="#bcd3ec" stroke="#8fb0d6" strokeWidth={3} strokeDasharray="6 4" />
      <path d="M-54 -286 L-36 -236 M54 -286 L36 -236" stroke="url(#fs-denim)" strokeWidth={18} strokeLinecap="round" />
      <circle cx={-44} cy={-243} r={7} fill="#d7a64a" />
      <circle cx={44} cy={-243} r={7} fill="#d7a64a" />
      <rect x={58} y={-198} width={36} height={46} rx={9} fill="#b57a4a" />
      <rect x={66} y={-214} width={8} height={26} rx={4} fill="#7cc7c9" />
      <rect x={78} y={-210} width={8} height={22} rx={4} fill="#ec6a8a" />
      {/* head */}
      <g data-p="f-head">
        <g transform="scale(0.86)">
        <ellipse cx={0} cy={4} rx={82} ry={78} fill="#b2602c" />
        <circle cx={-76} cy={4} r={15} fill="url(#fs-skinF)" />
        <circle cx={76} cy={4} r={15} fill="url(#fs-skinF)" />
        <circle cx={0} cy={0} r={76} fill="url(#fs-skinF)" />
        <circle cx={0} cy={0} r={76} fill="url(#fs-face)" />
        <ellipse cx={-46} cy={22} rx={16} ry={10} fill="#f08a78" opacity={0.45} />
        <ellipse cx={46} cy={22} rx={16} ry={10} fill="#f08a78" opacity={0.45} />
        <Eyes lidId="f-lids" spread={30} pupil={11} iris="#7a7d37" />
        <path d="M-50 -34 Q-30 -46 -12 -36 M12 -36 Q30 -46 50 -34" stroke="#8a4a1f" strokeWidth={7} strokeLinecap="round" fill="none" />
        <ellipse cx={0} cy={16} rx={8} ry={6} fill="#ee9b80" />
        {[-52, -44, -36, 36, 44, 52].map((x, i) => (
          <circle key={x} cx={x} cy={10 + (i % 3) * 5} r={2.2} fill="#d98260" opacity={0.7} />
        ))}
        <path d="M-24 34 Q0 52 24 34" stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
        <g data-p="f-grin" opacity={0}>
          <path d="M-30 30 Q0 74 30 30Z" fill="#7a2a22" />
          <path d="M-22 31 Q0 40 22 31 L20 38 Q0 46 -20 38Z" fill="#fff" />
        </g>
        {/* fringe */}
        <path d="M-78 -16 C-84 -76 -30 -92 10 -84 C54 -78 82 -52 78 -16 C62 -46 34 -58 8 -54 C-22 -52 -54 -42 -78 -16Z" fill="#c4682d" />
        <path d="M-60 -40 C-40 -64 -6 -72 22 -66" stroke="#da8348" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.7} />
        {/* hat (swings a little behind the head's movement) */}
        <g data-p="f-hat">
          <ellipse cx={0} cy={-52} rx={128} ry={32} fill="#000" opacity={0.14} />
          <ellipse cx={0} cy={-56} rx={128} ry={32} fill="url(#fs-hat)" />
          <ellipse cx={0} cy={-60} rx={118} ry={26} fill="#e7cc9b" opacity={0.6} />
          <path d="M-72 -60 C-76 -128 -34 -140 0 -138 C40 -140 78 -128 72 -60Z" fill="url(#fs-hat)" />
          <path d="M-72 -60 C-76 -128 -34 -140 0 -138 C40 -140 78 -128 72 -60Z" fill="url(#fs-body)" opacity={0.7} />
          <path d="M-72 -64 C-30 -50 30 -50 72 -64 L72 -78 C30 -66 -30 -66 -72 -78Z" fill="#8b5a36" />
          <path d="M-22 -136 C-6 -122 10 -122 26 -136" stroke="#b58f5d" strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M-110 -50 q30 18 110 18 q80 0 110 -18" stroke="#b58f5d" strokeWidth={3} fill="none" opacity={0.6} strokeDasharray="8 6" />
        </g>
        </g>
      </g>
    </g>
  );
}

function Customer() {
  return (
    <g data-p="c-body">
      {/* legs + shoes */}
      <rect x={-40} y={-120} width={26} height={100} rx={13} fill="url(#fs-skinC)" />
      <rect x={14} y={-120} width={26} height={100} rx={13} fill="url(#fs-skinC)" />
      <path d="M-52 0 Q-56 -22 -38 -26 L-6 -26 Q4 -22 4 -10 L4 0Z" fill="#f2d24f" />
      <path d="M52 0 Q56 -22 38 -26 L6 -26 Q-4 -22 -4 -10 L-4 0Z" fill="#f2d24f" />
      <rect x={-44} y={-12} width={44} height={9} rx={4} fill="#fff" opacity={0.85} />
      <rect x={0} y={-12} width={44} height={9} rx={4} fill="#fff" opacity={0.85} />
      <rect x={-40} y={-120} width={26} height={100} rx={13} fill="url(#fs-body)" />
      <rect x={14} y={-120} width={26} height={100} rx={13} fill="url(#fs-body)" />
      {/* neck */}
      <rect x={-21} y={-300} width={42} height={36} rx={14} fill="url(#fs-skinC)" />
      {/* blouse + apron dress */}
      <rect x={-82} y={-288} width={164} height={150} rx={54} fill="#fbf2e2" />
      <rect x={-82} y={-288} width={164} height={150} rx={54} fill="url(#fs-body)" />
      <path d="M-66 -250 L66 -250 L96 -108 L-96 -108Z" fill="url(#fs-teal)" />
      <path d="M-66 -250 L66 -250 L96 -108 L-96 -108Z" fill="url(#fs-body)" />
      <path d="M-44 -236 L-72 -116 M44 -236 L72 -116" stroke="#000" strokeWidth={3} opacity={0.1} fill="none" />
      <path d="M-78 -118 L78 -118" stroke="#fff" strokeWidth={2.5} strokeDasharray="7 5" opacity={0.5} />
      <path d="M-66 -250 Q0 -236 66 -250 L66 -262 Q0 -250 -66 -262Z" fill="#3b8493" />
      <path d="M-52 -288 L-46 -250 M52 -288 L46 -250" stroke="url(#fs-teal)" strokeWidth={18} strokeLinecap="round" />
      <circle cx={-46} cy={-252} r={6} fill="#d9b27c" />
      <circle cx={46} cy={-252} r={6} fill="#d9b27c" />
      <rect x={-52} y={-190} width={104} height={54} rx={12} fill="#2f7685" opacity={0.45} />
      <path d="M-16 -292 L0 -272 L16 -292" fill="#fff" stroke="#efe3cc" strokeWidth={3} />
      {/* head */}
      <g data-p="c-head">
        <g transform="scale(0.86)">
        <g data-p="c-hair">
          <path d="M-84 -10 C-100 -92 -50 -112 0 -112 C50 -112 100 -92 84 -10 C98 40 96 96 70 130 L-70 130 C-96 96 -98 40 -84 -10Z" fill="#3a241a" />
          <path d="M-96 60 q8 30 -10 60 M96 60 q-8 30 10 60" stroke="#4a2f22" strokeWidth={10} strokeLinecap="round" fill="none" />
          <path d="M-70 20 q-6 40 6 80 M70 20 q6 40 -6 80 M-40 -90 q40 -14 80 0" stroke="#6a4636" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.6} />
        </g>
        <circle cx={-76} cy={6} r={14} fill="url(#fs-skinC)" />
        <circle cx={76} cy={6} r={14} fill="url(#fs-skinC)" />
        <circle cx={0} cy={0} r={74} fill="url(#fs-skinC)" />
        <circle cx={0} cy={0} r={74} fill="url(#fs-face)" />
        <ellipse cx={-46} cy={24} rx={17} ry={11} fill="#e0705a" opacity={0.4} />
        <ellipse cx={46} cy={24} rx={17} ry={11} fill="#e0705a" opacity={0.4} />
        <g data-p="c-eyes">
          <Eyes lidId="c-lids" spread={29} pupil={13} iris="#5a3320" ry={21} />
        </g>
        <path d="M-52 -38 Q-30 -52 -10 -40 M10 -40 Q30 -52 52 -38" stroke="#2a1812" strokeWidth={7} strokeLinecap="round" fill="none" />
        <ellipse cx={0} cy={18} rx={9} ry={6.5} fill="#d4805a" />
        <g data-p="c-smile">
          <path d="M-30 30 Q0 66 30 30 Z" fill="#8a2f26" />
          <path d="M-24 31 Q0 38 24 31 L22 39 Q0 47 -22 39Z" fill="#fff" />
        </g>
        <ellipse data-p="c-o" cx={0} cy={40} rx={11} ry={14} fill="#8a2f26" opacity={0} />
        {/* bangs + headband */}
        <path d="M-76 -26 C-72 -84 -18 -92 0 -90 C20 -92 74 -84 76 -26 C56 -56 30 -64 0 -66 C-30 -64 -56 -56 -76 -26Z" fill="#46291d" />
        <path d="M-84 -34 C-70 -102 70 -102 84 -34" stroke="#e24a2d" strokeWidth={20} strokeLinecap="round" fill="none" />
        <path d="M-66 -64 C-40 -88 40 -88 66 -64" stroke="#f4795c" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.7} />
        </g>
      </g>
    </g>
  );
}

/** Two-segment arm drawn pointing down from its group origin; pose.ts rotates the groups. */
function Arm({ id, sleeve, skin, sleeveLen, children }: { id: string; sleeve: string; skin: string; sleeveLen: number; children?: React.ReactNode }) {
  const { L1, L2 } = ARM;
  return (
    <g data-p={`${id}1`}>
      <rect x={-17} y={-12} width={34} height={L1 + 16} rx={17} fill={skin} />
      <rect x={-17} y={-12} width={34} height={L1 + 16} rx={17} fill="url(#fs-body)" />
      <rect x={-19} y={-14} width={38} height={sleeveLen} rx={19} fill={sleeve} />
      <g data-p={`${id}2`}>
        <rect x={-14} y={-6} width={28} height={L2 + 8} rx={14} fill={skin} />
        {/* hand: palm, thumb on the inside, finger creases and a knuckle highlight */}
        <ellipse cx={0} cy={L2 + 8} rx={17} ry={20} fill={skin} />
        <ellipse cx={-15} cy={L2 + 2} rx={6.5} ry={12} fill={skin} transform={`rotate(18 -15 ${L2 + 2})`} />
        <path d={`M-8 ${L2 + 16} v9 M0 ${L2 + 18} v10 M8 ${L2 + 16} v9`} stroke="#000" strokeWidth={2} strokeLinecap="round" opacity={0.18} />
        <ellipse cx={4} cy={L2 - 2} rx={8} ry={5} fill="#fff" opacity={0.18} />
        <ellipse cx={0} cy={L2 + 6} rx={14} ry={8} fill="#000" opacity={0.05} />
        {children}
      </g>
    </g>
  );
}

function Tomato() {
  return (
    <g data-p="tomato">
      <ellipse cx={0} cy={30} rx={26} ry={5} fill="#000" opacity={0.0} />
      <ellipse cx={0} cy={2} rx={34} ry={30} fill="url(#fs-tomato)" />
      <path d="M-16 -22 C-22 -4 -20 14 -12 26 M16 -22 C22 -4 20 14 12 26 M0 -26 C-3 0 -3 14 0 28" stroke="#9a1c13" strokeWidth={2} fill="none" opacity={0.25} strokeLinecap="round" />
      <ellipse cx={-13} cy={-13} rx={11} ry={6.5} fill="#fff" opacity={0.42} transform="rotate(-28 -13 -13)" />
      <circle cx={-21} cy={-3} r={2.4} fill="#fff" opacity={0.55} />
      <ellipse cx={14} cy={20} rx={16} ry={6} fill="#6e0f08" opacity={0.18} />
      <g data-p="t-leaf">
        <path d="M0 -24 C-10 -34 -26 -30 -30 -22 C-18 -22 -10 -20 0 -24 C10 -20 18 -22 30 -22 C26 -30 10 -34 0 -24 M0 -24 C-2 -34 2 -38 6 -40" fill="#5aa532" stroke="#3f8523" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <path d="M-20 -26 C-12 -26 -6 -25 0 -24 M20 -26 C12 -26 6 -25 0 -24" stroke="#8fd05a" strokeWidth={2} fill="none" opacity={0.7} />
      </g>
      <g data-p="t-face">
        <ellipse cx={-12} cy={0} rx={7} ry={8.5} fill="#fff" />
        <ellipse cx={12} cy={0} rx={7} ry={8.5} fill="#fff" />
        <circle cx={-11} cy={1} r={4.4} fill="#5b2f1a" />
        <circle cx={13} cy={1} r={4.4} fill="#5b2f1a" />
        <circle cx={-12.5} cy={-1} r={1.5} fill="#fff" />
        <circle cx={11.5} cy={-1} r={1.5} fill="#fff" />
        <path d="M-9 14 Q0 21 9 14" stroke="#7a1d14" strokeWidth={3} strokeLinecap="round" fill="none" />
        <ellipse cx={-22} cy={11} rx={5} ry={3} fill="#ff9a8a" opacity={0.7} />
        <ellipse cx={22} cy={11} rx={5} ry={3} fill="#ff9a8a" opacity={0.7} />
      </g>
    </g>
  );
}

function Slices() {
  return (
    <g data-p="slices">
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} data-p={`slice${i}`} opacity={0} transform={`translate(${BOARD_X + 14 + i * 15} ${COUNTER_TOP - 30 + (i % 2) * 2}) rotate(${-8 + i * 4})`}>
          <ellipse cx={0} cy={0} rx={13} ry={20} fill="#e5372a" />
          <ellipse cx={0} cy={0} rx={9} ry={15} fill="#ff7a5c" />
          <circle cx={-2} cy={-5} r={1.8} fill="#ffe7a8" />
          <circle cx={3} cy={3} r={1.8} fill="#ffe7a8" />
          <circle cx={-3} cy={8} r={1.8} fill="#ffe7a8" />
        </g>
      ))}
    </g>
  );
}

function Dish() {
  return (
    <g data-p="dish" opacity={0}>
      <ellipse cx={0} cy={14} rx={86} ry={20} fill="#000" opacity={0.12} />
      <ellipse cx={0} cy={6} rx={80} ry={20} fill="#fff" />
      <ellipse cx={0} cy={4} rx={58} ry={13} fill="#f1ede4" />
      {/* a colourful little salad */}
      {[
        [-34, -6, 13, "#e5372a"],
        [-12, -16, 14, "#6fb645"],
        [14, -12, 13, "#f4b63e"],
        [34, -4, 12, "#e5372a"],
        [0, -4, 14, "#8cc84f"],
        [-22, 2, 11, "#f08a2a"],
        [22, 2, 11, "#7a4fa3"],
        [4, -28, 11, "#6fb645"],
      ].map(([x, y, r, c], i) => (
        <circle key={i} cx={Number(x)} cy={Number(y)} r={Number(r)} fill={String(c)} />
      ))}
      <circle cx={-6} cy={-32} r={5} fill="#fff" opacity={0.6} />
    </g>
  );
}

function Sparkle({ id }: { id: string }) {
  return <path data-p={id} d="M0 -14 L3.5 -3.5 L14 0 L3.5 3.5 L0 14 L-3.5 3.5 L-14 0 L-3.5 -3.5Z" fill="#ffd74a" opacity={0} />;
}

function Hearts() {
  return (
    <g data-p="hearts" opacity={0}>
      {[
        [0, 0, 1],
        [70, -34, 0.7],
      ].map(([x, y, s], i) => (
        <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0 12 C-34 -10 -18 -36 0 -18 C18 -36 34 -10 0 12Z" fill="#ef5b72" />
      ))}
    </g>
  );
}

/** The whole animated stage. The root group's transform is the camera. */
export function Scene() {
  return (
    <>
      <Defs />
      <g data-p="camera">
        <Backdrop />
        <Garden />
        <Kitchen />
        <ellipse data-p="f-shadow" cx={0} cy={0} rx={96} ry={15} fill="url(#fs-shadow)" opacity={0.7} />
        <ellipse data-p="c-shadow" cx={0} cy={0} rx={96} ry={15} fill="url(#fs-shadow)" opacity={0.7} />
        <ellipse data-p="t-shadow" cx={0} cy={0} rx={34} ry={7} fill="url(#fs-shadow)" opacity={0} />
        <Farmer />
        <Customer />
        {/* arms sit in front of the bodies; the farmer's reaches with a plaid sleeve, hers has a white one */}
        <Arm id="f-a" sleeve="url(#fs-plaid)" skin="url(#fs-skinF)" sleeveLen={78} />
        <Arm id="c-b" sleeve="#fbf2e2" skin="url(#fs-skinC)" sleeveLen={46} />
        <Arm id="c-a" sleeve="#fbf2e2" skin="url(#fs-skinC)" sleeveLen={46}>
          <g data-p="c-knife" opacity={0}>
            <rect x={-6} y={-2} width={12} height={22} rx={5} fill="#8b5a36" />
            <path d="M-8 20 L8 20 L9 86 Q0 98 -9 86Z" fill="#d6dde2" />
            <path d="M-6 24 L-6 84" stroke="#fff" strokeWidth={3} opacity={0.7} />
          </g>
        </Arm>
        <Slices />
        <Tomato />
        <Dish />
        {[0, 1, 2].map((i) => (
          <Sparkle key={i} id={`spark${i}`} />
        ))}
        <Hearts />
      </g>
    </>
  );
}
