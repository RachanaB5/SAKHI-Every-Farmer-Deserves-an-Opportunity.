// Pure animation maths for the farm-to-table story: given scroll progress
// p (0–1) it returns the transform / opacity of every moving part. There is
// no clock anywhere, so the picture is always exactly where the scroll is
// and runs backwards just as well.
//
// Arms are two-bone limbs solved with inverse kinematics from a hand
// *target*, and the tomato is glued to those same hand positions, so it can
// never drift away from, or teleport between, the two characters.
//
// World units are the SVG's: 1760 × 900 with the ground at y = 800.

export interface Pt {
  x: number;
  y: number;
}

/** What the scene needs on screen at one moment. Keys are the `data-p` ids in scene.tsx. */
export interface Pose {
  /** transform attribute per part */
  t: Record<string, string>;
  /** opacity per part */
  o: Record<string, number>;
  /** camera: world point at the screen centre and zoom (only used on portrait screens) */
  cam: { cx: number; zoom: number };
  /** which caption is showing: opacity per caption index */
  captions: number[];
}

export const WORLD = { W: 1760, H: 900, ground: 800 } as const;

/** Arm segment lengths (shoulder→elbow, elbow→wrist). */
export const ARM = { L1: 95, L2: 95 } as const;

const LAYOUT = {
  fx: 360, // farmer
  plantX: 575,
  cx0: 1160, // customer start / walk / present positions
  cx1: 1440,
  cxP: 1270,
  boardX: 1235,
  counterTop: WORLD.ground - 180,
  panX: 1665,
};

const D2R = Math.PI / 180;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const pt = (x: number, y: number): Pt => ({ x, y });
const f = (n: number) => Math.round(n * 100) / 100;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

type Key = [p: number, at: Pt, ease?: (t: number) => number];

/** Moves through keyframed points; each segment uses the ease of the key it arrives at. */
function track(p: number, keys: Key[]): Pt {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, a] = keys[i - 1];
      const [p1, b, ease = easeInOut] = keys[i];
      return mix(a, b, ease(seg(p, p0, p1)));
    }
  }
  return keys[keys.length - 1][1];
}

/** A scalar version of `track`. */
function trackN(p: number, keys: [number, number, ((t: number) => number)?][]): number {
  return track(p, keys.map(([k, v, e]) => [k, pt(v, 0), e] as Key)).x;
}

/** Shoulder position of a body that is bobbing, leaning and squashing about its feet. */
function bodyPoint(root: Pt, lean: number, sx: number, sy: number, local: Pt): Pt {
  const x = local.x * sx;
  const y = local.y * sy;
  const c = Math.cos(lean * D2R);
  const s = Math.sin(lean * D2R);
  return { x: root.x + x * c - y * s, y: root.y + x * s + y * c };
}

/**
 * Two-bone IK. `bend` picks which way the elbow points (+1 = below the
 * shoulder→hand line when reaching right). Returns the SVG rotations for the
 * upper arm and (relative) forearm, and the hand's actual world position
 * (clamped to what the arm can reach).
 */
function solveArm(shoulder: Pt, target: Pt, bend: 1 | -1) {
  const { L1, L2 } = ARM;
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
  const phi = Math.atan2(dy, dx);
  const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const a1 = phi + bend * alpha;
  const elbow = pt(shoulder.x + Math.cos(a1) * L1, shoulder.y + Math.sin(a1) * L1);
  const hand = pt(shoulder.x + Math.cos(phi) * d, shoulder.y + Math.sin(phi) * d);
  const a2 = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
  return { r1: (a1 - Math.PI / 2) / D2R, r2: (a2 - a1) / D2R, hand, forearm: (a2 - Math.PI / 2) / D2R };
}

const armAttrs = (id: string, shoulder: Pt, ik: ReturnType<typeof solveArm>, t: Pose["t"]) => {
  t[`${id}1`] = `translate(${f(shoulder.x)} ${f(shoulder.y)}) rotate(${f(ik.r1)})`;
  t[`${id}2`] = `translate(0 ${ARM.L1}) rotate(${f(ik.r2)})`;
};

/** Caption windows (progress): the first is on at the very start, the last at the very end. */
const CAPTION_AT = [0, 0.2, 0.45, 0.78, 2];
const CAPTION_FADE = 0.035;

/**
 * Everything on screen at progress `p`.
 * @param portrait - phone layout: the camera pans with the action instead of showing the whole scene
 */
export function pose(p: number, portrait: boolean): Pose {
  const { fx, plantX, cx0, cx1, cxP, boardX, counterTop, panX } = LAYOUT;
  const g = WORLD.ground;
  const t: Pose["t"] = {};
  const o: Pose["o"] = {};

  // ───────────────────────── farmer ─────────────────────────
  const hopF = Math.sin(seg(p, 0.13, 0.2) * Math.PI) * 14 + (p > 0.96 ? Math.abs(Math.sin((p - 0.96) * 150)) * 16 : 0);
  const windup = easeInOut(seg(p, 0.2, 0.3));
  const swing = easeIn(seg(p, 0.3, 0.38));
  const relax = easeInOut(seg(p, 0.38, 0.56));
  const leanOf = (q: number) => (q < 0.3 ? -7 * easeInOut(seg(q, 0.2, 0.3)) : q < 0.38 ? lerp(-7, 8, easeIn(seg(q, 0.3, 0.38))) : 8 * (1 - easeInOut(seg(q, 0.38, 0.56))));
  const leanF = leanOf(p);
  const syF = p < 0.3 ? 1 - 0.04 * windup : p < 0.38 ? lerp(0.96, 1.04, swing) : lerp(1.04, 1, relax);
  const sxF = 2 - syF;
  const rootF = pt(fx, g - hopF);
  t["f-body"] = `translate(${f(rootF.x)} ${f(rootF.y)}) rotate(${f(leanF)}) scale(${f(sxF)} ${f(syF)})`;
  const shoulderF = bodyPoint(rootF, leanF, sxF, syF, pt(86, -258));

  // Where the farmer's hand is at the instant of release (lean 8°, stretched 1.04, no hop). The tomato's flight starts here.
  const releaseBody = { sy: 1.04, sx: 0.96, lean: 8 };
  const shoulderAtRelease = bodyPoint(pt(fx, g), releaseBody.lean, releaseBody.sx, releaseBody.sy, pt(86, -258));
  const releaseHand = solveArm(shoulderAtRelease, add(shoulderAtRelease, pt(120, -70)), 1).hand;

  const T0 = pt(plantX + 4, g - 190); // tomato centre while it still hangs on the plant
  const hang = add(T0, pt(0, 14)); // where the hand grips it
  const restF = add(shoulderF, pt(22, 168));
  const holdUp = add(shoulderF, pt(62, -34));
  const windUp = add(shoulderF, pt(-34, 30));
  const release = add(shoulderF, pt(120, -70));
  const follow = add(shoulderF, pt(135, -112));
  const wave = add(shoulderF, pt(56, -150));
  let handTargetF = track(p, [
    [0, restF],
    [0.12, hang],
    [0.14, add(hang, pt(7, 9))], // a little tug as it comes free
    [0.2, holdUp],
    [0.21, holdUp],
    [0.3, windUp],
    [0.38, release, easeIn],
    [0.46, follow, easeOut],
    [0.6, restF],
    [0.92, restF],
    [0.96, wave],
  ]);
  if (p > 0.96) handTargetF = add(handTargetF, pt(Math.sin((p - 0.96) * 190) * 26, 0));
  const armF = solveArm(shoulderF, handTargetF, 1);
  armAttrs("f-a", shoulderF, armF, t);

  // face: looks at the tomato, then at the customer; grins when it's picked and at the end
  const lookF = p < 0.38 ? sub(p < 0.14 ? T0 : armF.hand, add(rootF, pt(0, -352))) : pt(300, 0);
  const lookFn = Math.hypot(lookF.x, lookF.y) || 1;
  t["f-pupils"] = `translate(${f((lookF.x / lookFn) * 4.5)} ${f((lookF.y / lookFn) * 3.5)})`;
  t["f-head"] = `translate(0 -344) rotate(${f(leanF * 0.5 + (p < 0.14 ? 4 * seg(p, 0.02, 0.12) : 0))})`;
  // The hat lags the head: it tips back as he leans in fast and swings forward as he stops.
  t["f-hat"] = `rotate(${f((leanOf(p - 0.03) - leanF) * 1.4 + Math.sin(seg(p, 0.13, 0.2) * Math.PI) * -3)} 0 -56)`;
  t["f-shadow"] = `translate(${f(fx + 18)} ${g + 5}) scale(${f(1 - hopF / 120)} 1)`;
  o["f-shadow"] = f(Math.max(0.2, 0.75 - hopF / 40));
  o["f-grin"] = clamp(seg(p, 0.13, 0.15) * (1 - seg(p, 0.24, 0.27)) + seg(p, 0.62, 0.66) * (1 - seg(p, 0.7, 0.74)) + seg(p, 0.94, 0.96));
  t["f-lids"] = blink(p, [0.06, 0.33, 0.52, 0.71, 0.9], "0 -6");

  // ───────────────────────── customer ─────────────────────────
  const walk = easeInOut(seg(p, 0.62, 0.74));
  const step = easeInOut(seg(p, 0.94, 1));
  const cx = p < 0.94 ? lerp(cx0, cx1, walk) : lerp(cx1, cxP, step);
  const walking = (p >= 0.62 && p < 0.74) || p >= 0.94;
  const walkPhase = p < 0.94 ? seg(p, 0.62, 0.74) : seg(p, 0.94, 1);
  const hopC = Math.sin(seg(p, 0.6, 0.67) * Math.PI) * 26;
  const bobC = walking ? Math.abs(Math.sin(walkPhase * Math.PI * 5)) * 9 : 0;
  const chop = seg(p, 0.78, 0.88);
  const chopBob = p > 0.78 && p < 0.88 ? Math.sin(chop * Math.PI * 10) * 1.5 : 0;
  const leanC = walking ? Math.sin(walkPhase * Math.PI * 5) * 2.5 : 0;
  const rootC = pt(cx, g - hopC - bobC - chopBob);
  t["c-body"] = `translate(${f(rootC.x)} ${f(rootC.y)}) rotate(${f(leanC)})`;
  const shoulderA = bodyPoint(rootC, leanC, 1, 1, pt(-80, -262));
  const shoulderB = bodyPoint(rootC, leanC, 1, 1, pt(80, -262));
  const shoulderA0 = pt(cx0 - 80, g - 262); // standing, before anything moves

  const boardRest = pt(boardX - 4, counterTop - 44); // tomato centre sitting on the board
  const boardHold = add(boardRest, pt(0, 14)); // where her hand grips it
  const shoulderA1 = pt(cx1 - 80, g - 262);

  // Catch point for her left hand, in world space at her starting position.
  const catchHand = add(shoulderA0, pt(-104, -48));
  const restRelA = pt(-20, 168);
  const relA = track(p, [
    [0, restRelA],
    [0.46, restRelA],
    [0.54, pt(-92, -18)], // hand comes up ready
    [0.6, sub(catchHand, shoulderA0)],
    [0.63, sub(catchHand, shoulderA0)],
    [0.68, pt(-52, 74)], // carries it
    [0.74, sub(boardHold, shoulderA1)],
  ]);
  const knifeX = boardX + 30 - chop * 50;
  const up = (1 + Math.cos(chop * Math.PI * 10)) / 2; // five chops
  const chopHand = pt(knifeX + 29, counterTop - 95 - 42 * up);
  const sweepHand = pt(boardX + 70, counterTop - 40);
  const plateA = pt(-85, 30);
  let handTargetA: Pt;
  if (p < 0.74) handTargetA = add(shoulderA, relA);
  else {
    handTargetA = track(p, [
      [0.74, boardHold],
      [0.77, boardHold],
      [0.78, chopHand],
      [0.88, chopHand],
      [0.9, sweepHand],
      [0.925, sweepHand],
      [0.94, add(pt(cx1 - 80, g - 262), plateA)],
    ]);
    if (p >= 0.94) handTargetA = add(shoulderA, plateA);
    if (p >= 0.78 && p < 0.88) handTargetA = chopHand;
  }
  // The catch has some give: the hand is pushed back and down by the tomato, then settles.
  const recoil = Math.sin(clamp(seg(p, 0.6, 0.655)) * Math.PI);
  if (p >= 0.6 && p < 0.74) handTargetA = add(handTargetA, pt(11 * recoil, 9 * recoil));
  const armA = solveArm(shoulderA, handTargetA, -1);
  armAttrs("c-a", shoulderA, armA, t);

  const gripPan = pt(panX - 75, counterTop - 24);
  const plateB = pt(-115, 34);
  const shake = p > 0.9 && p < 0.935 ? Math.sin(seg(p, 0.9, 0.935) * Math.PI * 6) * 11 : 0;
  const restB = add(shoulderB, pt(20, 168));
  const handTargetB = add(
    track(p, [
      [0, restB],
      [0.8, restB],
      [0.85, gripPan],
      [0.935, gripPan],
      [0.955, add(shoulderB, plateB)],
    ]),
    pt(0, shake),
  );
  // Reaching right (the pan) the elbow hangs below; holding the plate across her body it must hang
  // below on the other side. Blend the two solutions' joint angles so the elbow never snaps.
  const reachRight = solveArm(shoulderB, handTargetB, 1);
  const reachLeft = solveArm(shoulderB, handTargetB, -1);
  const wLeft = easeInOut(seg(p, 0.935, 0.955));
  const armB = {
    ...reachRight,
    r1: lerp(reachRight.r1, reachLeft.r1, wLeft),
    r2: lerp(reachRight.r2, reachLeft.r2, wLeft),
  };
  armAttrs("c-b", shoulderB, armB, t);

  // knife rides on her left hand while chopping, pointing down-left whatever the forearm does
  t["c-knife"] = `translate(0 ${ARM.L2 + 6}) rotate(${f(24 - (armA.r1 + armA.r2))})`;
  o["c-knife"] = clamp(seg(p, 0.77, 0.785)) * (1 - seg(p, 0.88, 0.9));

  // face
  const lookC = p < 0.6 ? pt(-300, -30 + 60 * seg(p, 0.46, 0.6)) : p < 0.74 ? pt(-20, 60) : p < 0.94 ? pt(-10, 90) : pt(-300, 0);
  const lookCn = Math.hypot(lookC.x, lookC.y) || 1;
  t["c-pupils"] = `translate(${f((lookC.x / lookCn) * 4.5)} ${f((lookC.y / lookCn) * 4)})`;
  t["c-head"] = `translate(0 -344) rotate(${f(leanC * 0.6 + (p >= 0.74 && p < 0.9 ? 4 : 0))})`;
  const surprised = seg(p, 0.46, 0.5) * (1 - seg(p, 0.585, 0.605));
  t["c-eyes"] = `translate(0 -6) scale(1 ${f(1 + 0.16 * surprised)}) translate(0 6)`;
  o["c-o"] = surprised;
  o["c-smile"] = 1 - surprised;
  // Her hair swings behind her steps and hop.
  const hairSwing = (walking ? Math.sin((walkPhase - 0.05) * Math.PI * 5) * -3.2 : 0) - Math.sin(seg(p, 0.6, 0.72) * Math.PI * 2) * 2.4;
  t["c-hair"] = `rotate(${f(hairSwing)} 0 -90)`;
  t["c-shadow"] = `translate(${f(cx + 16)} ${g + 5}) scale(${f(1 - (hopC + bobC) / 130)} 1)`;
  o["c-shadow"] = f(Math.max(0.2, 0.75 - (hopC + bobC) / 45));
  t["c-lids"] = blink(p, [0.08, 0.4, 0.69, 0.84, 0.97], "0 -6");

  // ───────────────────────── tomato ─────────────────────────
  // The plant sways in the breeze, but is still while it is being picked, and the hanging tomato rides the same rotation.
  const plantAmp = p < 0.13 ? 1 - seg(p, 0.08, 0.13) : seg(p, 0.15, 0.25);
  const plantAng = Math.sin(p * 30) * 1.4 * plantAmp;
  const pivot = pt(plantX, g - 10);
  const rel = sub(T0, pivot);
  const swayed = pt(pivot.x + rel.x * Math.cos(plantAng * D2R) - rel.y * Math.sin(plantAng * D2R), pivot.y + rel.x * Math.sin(plantAng * D2R) + rel.y * Math.cos(plantAng * D2R));
  let tp: Pt;
  let tr = 0;
  let tsx = 1;
  let tsy = 1;
  const tUp = pt(0, -14); // tomato centre sits just above a gripping hand
  if (p < 0.14) {
    tp = swayed;
    tr = plantAng;
  } else if (p < 0.38) {
    tp = add(armF.hand, tUp);
    tr = (armF.forearm + 90) * 0.1;
  } else if (p < 0.6) {
    const a = add(releaseHand, tUp);
    const b = add(catchHand, tUp);
    const k = seg(p, 0.38, 0.6);
    tp = pt(lerp(a.x, b.x, k), lerp(a.y, b.y, k) - 4 * 165 * k * (1 - k));
    tr = k * 720;
    const stretch = Math.sin(k * Math.PI) * 0.1;
    tsx = 1 + stretch;
    tsy = 1 - stretch * 0.8;
  } else if (p < 0.77) {
    tp = add(armA.hand, tUp);
    // a little squish as the catch lands
    const land = Math.sin(clamp(seg(p, 0.6, 0.64)) * Math.PI);
    tsx = 1 + 0.12 * land;
    tsy = 1 - 0.14 * land;
  } else {
    tp = boardRest;
  }
  // the tomato (and its face) the girl is about to chop shrinks away as it is cut
  const left = 1 - chop * 0.97;
  if (p >= 0.77) {
    tsx = left;
    tsy = left;
    tp = pt(boardRest.x - 30 + 30 * left, counterTop - 16 - 29 * left);
  }
  const flightK = seg(p, 0.38, 0.6);
  const leafAng = p >= 0.38 && p < 0.6 ? Math.sin(flightK * Math.PI * 4) * 16 * (1 - flightK * 0.3) : p >= 0.6 && p < 0.66 ? Math.sin(seg(p, 0.6, 0.66) * Math.PI * 3) * 9 * (1 - seg(p, 0.6, 0.66)) : 0;
  t["t-leaf"] = `rotate(${f(leafAng)} 0 -24)`;
  if (p >= 0.38 && p < 0.6) {
    const height = g - tp.y;
    const sc = clamp(1 - height / 650, 0.35, 1);
    t["t-shadow"] = `translate(${f(tp.x + 14)} ${g + 12}) scale(${f(sc)} ${f(sc)})`;
    o["t-shadow"] = f(0.7 * sc);
  } else if (p >= 0.77 && p < 0.885) {
    t["t-shadow"] = `translate(${f(tp.x + 8)} ${counterTop - 8}) scale(${f(0.8 * left)} ${f(0.6 * left)})`;
    o["t-shadow"] = f(0.7 * left);
  } else o["t-shadow"] = 0;
  t["tomato"] = `translate(${f(tp.x)} ${f(tp.y)}) rotate(${f(tr)}) scale(${f(tsx)} ${f(tsy)})`;
  o["tomato"] = p >= 0.885 ? 0 : 1;
  o["t-face"] = 1 - seg(p, 0.74, 0.78);

  // slices: appear one by one as the knife goes through, then hop into the pan
  for (let i = 0; i < 5; i++) o[`slice${i}`] = clamp((chop - (i + 0.35) / 5.6) * 9);
  const toss = easeInOut(seg(p, 0.88, 0.925));
  const sx0 = pt(0, 0);
  const sliceHop = pt(lerp(sx0.x, panX - 50 - (boardX + 40), toss), lerp(0, counterTop - 40 - (counterTop - 24), toss) - Math.sin(toss * Math.PI) * 250);
  t["slices"] = `translate(${f(sliceHop.x)} ${f(sliceHop.y)})`;
  o["slices"] = 1 - seg(p, 0.915, 0.93);

  // pan: sizzle once the slices land, shakes with her arm
  o["pan-food"] = seg(p, 0.915, 0.935) * (1 - seg(p, 0.95, 0.97));
  t["pan"] = `translate(0 ${f(shake * 0.6)})`;
  const steam = seg(p, 0.92, 0.94) * (1 - seg(p, 0.96, 0.98));
  for (let i = 0; i < 3; i++) {
    o[`steam${i}`] = steam * (0.5 + 0.5 * Math.sin(p * 90 + i * 2));
    t[`steam${i}`] = `translate(0 ${f(-((p * 520 + i * 20) % 46))})`;
  }

  // the finished dish, popping up between her hands
  const dish = easeOutBack(seg(p, 0.945, 0.975));
  const plateC = pt(cx - 100, g - 262 + 22);
  t["dish"] = `translate(${f(plateC.x)} ${f(plateC.y)}) scale(${f(Math.max(0, dish))})`;
  o["dish"] = p >= 0.945 ? 1 : 0;
  const glow = seg(p, 0.96, 0.99);
  for (let i = 0; i < 3; i++) {
    o[`spark${i}`] = glow * (0.55 + 0.45 * Math.sin(p * 120 + i * 2.1));
    t[`spark${i}`] = `translate(${f(plateC.x + (i - 1) * 62)} ${f(plateC.y - 70 - ((p - 0.96) * 600 + i * 17) % 40)}) scale(${f(0.8 + 0.3 * Math.sin(p * 90 + i))})`;
  }
  // a pair of hearts floating between the two once everything is done
  const hearts = seg(p, 0.975, 1);
  o["hearts"] = hearts;
  t["hearts"] = `translate(${f(lerp(fx + 140, plateC.x - 120, 0.5))} ${f(g - 520 - hearts * 40)})`;

  // plants sway a little in the breeze as you scroll
  t["plant"] = `rotate(${f(plantAng)} ${plantX} ${g - 10})`;
  o["stem-knob"] = p < 0.14 ? 0 : 1;
  t["clouds"] = `translate(${f(p * -90)} 0)`;

  // ───────────────────────── camera & captions ─────────────────────────
  let cam = { cx: WORLD.W / 2, zoom: 1 };
  if (portrait) {
    const cxCam = trackN(p, [
      [0, 470],
      [0.28, 470],
      [0.5, 880, easeInOut],
      [0.66, 1260, easeInOut],
      [0.93, 1260],
      [1, 880, easeInOut],
    ]);
    cam = { cx: cxCam, zoom: lerp(1, 0.52, easeInOut(seg(p, 0.93, 1))) };
  }
  const captions = [0, 1, 2, 3].map((i) => {
    const lo = i === 0 ? -1 : CAPTION_AT[i];
    const hi = CAPTION_AT[i + 1];
    return clamp((p - lo) / CAPTION_FADE) * clamp((hi - p) / CAPTION_FADE);
  });
  return { t, o, cam, captions };
}

/** Eyes shut briefly around given progress values. Returns a transform for a lid-scaling group. */
function blink(p: number, at: number[], origin: string): string {
  const near = at.some((b) => Math.abs(p - b) < 0.004);
  const [ox, oy] = origin.split(" ").map(Number);
  return `translate(${ox} ${oy}) scale(1 ${near ? 0.12 : 1}) translate(${-ox} ${-oy})`;
}
