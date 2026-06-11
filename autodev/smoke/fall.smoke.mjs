// autodev/smoke/fall.smoke.mjs — M0 headless free-fall smoke (AC-1).
//
// Drops a 16x16 body inside a closed string-row tile box and asserts the
// EXACT resting y plus onGround === true. Exits 0 on success, non-zero on
// any mismatch.
//
// The expectation below is declared as exactly ONE `EXPECTED_REST_Y`
// declaration line — the M0 gate's sed inversion proof
// rewrites that line and expects this smoke to fail. The literal 96 was
// obtained by RUNNING this sim and printing body.y (floor top edge is at
// ty=7 → y=112; body height 16 → rest y = 112 - 16 = 96, confirmed by run).

import { applyGravity } from '../../src/core/physics.mjs';
import { moveAndCollide } from '../../src/core/collision.mjs';

const EXPECTED_REST_Y = 96;

// Closed 8x8 tile box: solid '#' border, hollow '.' interior.
const MAP = [
  '########',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '########',
];
const solidAt = (tx, ty) => (MAP[ty]?.[tx] ?? '#') === '#';

// 16x16 body at an interior position near the top of the box.
const body = { x: 48, y: 24, w: 16, h: 16, vx: 0, vy: 0 };

const STEPS = 100; // fixed bounded loop — far more than needed to settle
for (let step = 0; step < STEPS; step++) {
  applyGravity(body);
  moveAndCollide(body, solidAt);
}

if (body.y !== EXPECTED_REST_Y || body.onGround !== true) {
  console.error(
    `SMOKE FAIL: rest y=${body.y} onGround=${body.onGround} ` +
      `(expected y=${EXPECTED_REST_Y}, onGround=true)`,
  );
  process.exit(1);
}

console.log(
  `SMOKE OK: 16x16 body rests at y=${body.y} with onGround=true after ${STEPS} steps in a closed box`,
);
