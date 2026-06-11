// test/world.test.mjs — AC-2 acceptance tests (M1: level + hero + winnable world).
//
// CONTRACT this file pins for the M1 public surface (the implementation MUST
// provide exactly this API):
//
//   // src/core/world.mjs
//   //   createWorld(levelRows): levelRows is the SPEC-D4 level text — an array
//   //   of strings, one string per row ('#' solid, '.' empty, 'S' spawn,
//   //   'G' goal, 'E' enemy spawn). Returns a world object:
//   //     world.hero — the hero entity (Rivet): { x, y, w, h, vx, vy, onGround, name }
//   //                  top-left-corner pixel coordinates, integers only,
//   //                  hitbox exactly 12×14, name exactly 'Rivet'.
//   //     world.won  — boolean, false at creation; becomes true when the hero
//   //                  AABB overlaps the goal tile rectangle, checked AFTER
//   //                  integration in the same step.
//   //     step(world, input) — free function (matches the playthrough smoke);
//   //                  advance exactly one frame. input is the SPEC-D4
//   //                  per-frame record: { left, right, jump, fire, slide }
//   //                  booleans. Frame order (SPEC D2/D3):
//   //                    1) vx from input: right → +MOVE_VX(2), left → -MOVE_VX(2)
//   //                    2) jump sets vy = JUMP_VY(-10) ONLY when onGround
//   //                    3) gravity: vy += 1 (clamped at TERMINAL_VY=16)
//   //                    4) move + collide, X axis then Y (src/core/collision.mjs)
//   //                    5) win check (goal AABB overlap)
//
// FREEZE RULES (SPEC D10 / plan v2 R4):
//   - Every expected literal below was derived by RUNNING the headless sim
//     (M0 physics.mjs + collision.mjs stepped per the contract above), never
//     hand-computed.
//   - This file builds scenarios from INLINE level-string literals ONLY and
//     MUST NOT import src/levels/demo.mjs (demo is rewritten in M3; this file
//     freezes at M1's first commit). The demo file is only ever read as TEXT
//     for structural/hygiene checks that the sed inversion in the accept
//     block keeps satisfied.
//
// All assertions are exact integers / exact booleans — never ranges.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createWorld, step } from '../src/core/world.mjs';

// Complete SPEC-D4 input records — exactly {left,right,jump,fire,slide}.
const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, fire: false, slide: false });
const RIGHT = Object.freeze({ ...NO_INPUT, right: true });
const LEFT = Object.freeze({ ...NO_INPUT, left: true });
const JUMP = Object.freeze({ ...NO_INPUT, jump: true });

// Flat winnable room. S at tile (1,2) → spawn (16,32); G at tile (10,2) →
// goal rect [160,176)×[32,48); floor top edge at y=48.
const L_FLAT = [
  '............',
  '............',
  '.S........G.',
  '############',
];

// Tall room with jump headroom. S at tile (1,6) → spawn (16,96); floor top
// edge at y=112; settled hero top y = 112 - 14 = 98. The G tile sits at (6,0),
// far outside the jump arc (apex y=53 at x=16) — it is non-solid and never
// overlapped, present only so every level literal carries a goal.
const L_JUMP = [
  '......G.',
  '........',
  '........',
  '........',
  '........',
  '........',
  '.S......',
  '########',
];

// Flat room with an enemy-spawn marker between S and G — 'E' must parse as
// NON-solid for collision (enemy behavior itself lands in M3).
const L_E = [
  '........',
  '........',
  '.S.E..G.',
  '########',
];

test('AC-2: spawn — hero top-left at the S-tile origin (x=tx*16, y=ty*16), hitbox exactly 12×14, at rest, named Rivet, won===false', () => {
  const world = createWorld(L_FLAT);
  assert.equal(world.hero.x, 16, 'spawn x = S tile tx*16 = 1*16');
  assert.equal(world.hero.y, 32, 'spawn y = S tile ty*16 = 2*16');
  assert.equal(world.hero.w, 12, 'hero hitbox width (SPEC D3)');
  assert.equal(world.hero.h, 14, 'hero hitbox height (SPEC D3)');
  assert.equal(world.hero.vx, 0, 'spawns at rest');
  assert.equal(world.hero.vy, 0, 'spawns at rest');
  assert.equal(world.hero.name, 'Rivet', 'hero display name is Rivet (ORIGINAL ONLY)');
  assert.equal(world.won, false, 'a fresh world has not been won');
});

test('AC-2: settle — a 12×14 hero spawned at the S-tile origin falls the 2px gap onto the floor in exactly 2 neutral steps (run-derived: y 32→33→34, then stable)', () => {
  const world = createWorld(L_FLAT);
  step(world,NO_INPUT);
  assert.equal(world.hero.y, 33, 'step 1: vy=1 then y+=1 (semi-implicit Euler)');
  assert.equal(world.hero.vy, 1);
  assert.equal(world.hero.onGround, false, 'still falling after step 1');
  step(world,NO_INPUT);
  assert.equal(world.hero.y, 34, 'step 2: clamped onto the floor (y = 3*16 - 14)');
  assert.equal(world.hero.vy, 0, 'vy zeroed by floor contact');
  assert.equal(world.hero.onGround, true, 'settled');
  step(world,NO_INPUT);
  assert.equal(world.hero.y, 34, 'settled hero stays put');
  assert.equal(world.hero.x, 16, 'no input ⇒ no horizontal motion');
  assert.equal(world.hero.onGround, true);
});

test('AC-2: MOVE_VX=2 — settled hero moves exactly 2px per step right, then exactly 2px per step left (run-derived x: 18,20,22 then 20,18)', () => {
  const world = createWorld(L_FLAT);
  step(world,NO_INPUT);
  step(world,NO_INPUT); // settle (y=34, onGround)
  const expectedRight = [18, 20, 22];
  for (const ex of expectedRight) {
    step(world,RIGHT);
    assert.equal(world.hero.x, ex, `x after a right step`);
    assert.equal(world.hero.y, 34, 'grounded run never changes y');
    assert.equal(world.hero.onGround, true);
  }
  const expectedLeft = [20, 18];
  for (const ex of expectedLeft) {
    step(world,LEFT);
    assert.equal(world.hero.x, ex, `x after a left step`);
    assert.equal(world.hero.y, 34, 'grounded run never changes y');
  }
});

test('AC-2: jump arithmetic per SPEC D2 order — frame-1 rise exactly 9px (vy=-10 then +1 gravity then move), apex rise 45px at frame 10, lands back at frame 20 (all run-derived)', () => {
  const world = createWorld(L_JUMP);
  step(world,NO_INPUT);
  step(world,NO_INPUT); // settle
  assert.equal(world.hero.y, 98, 'settled y (run-derived: 7*16 - 14)');
  assert.equal(world.hero.onGround, true);

  // Frame 1 with jump held: vy = -10, then vy += 1 → -9, then y += vy.
  step(world,JUMP);
  assert.equal(world.hero.vy, -9, 'jump frame vy is exactly JUMP_VY + GRAVITY');
  assert.equal(world.hero.y, 89, 'frame-1 rise is exactly 9px (98 - 9)');
  assert.equal(world.hero.onGround, false, 'airborne after the jump frame');

  // Frame 2, jump STILL held: mid-air hold must NOT re-trigger (vy follows
  // gravity to -8, never resets to -9).
  step(world,JUMP);
  assert.equal(world.hero.vy, -8, 'held jump does not re-trigger mid-air');
  assert.equal(world.hero.y, 81, 'run-derived frame-2 y');

  // Hold jump through the whole arc. Run-derived trajectory (frame:y,vy):
  //  1:89,-9  2:81,-8  3:74,-7  4:68,-6  5:63,-5  6:59,-4  7:56,-3  8:54,-2
  //  9:53,-1 10:53,0  11:54,1  12:56,2  13:59,3  14:63,4  15:68,5  16:74,6
  // 17:81,7 18:89,8  19:98,9  20:98,0(onGround)
  for (let frame = 3; frame <= 10; frame++) {
    step(world,JUMP);
    assert.notEqual(world.hero.vy, -9, `mid-air hold never re-triggers (frame ${frame})`);
  }
  assert.equal(world.hero.y, 53, 'apex y: total rise exactly 45px (98 - 45)');
  assert.equal(world.hero.vy, 0, 'vy is exactly 0 at the apex frame');

  for (let frame = 11; frame <= 20; frame++) step(world,JUMP);
  assert.equal(world.hero.y, 98, 'lands back at the settled y (run-derived frame 20)');
  assert.equal(world.hero.vy, 0, 'landing zeroes vy');
  assert.equal(world.hero.onGround, true, 'landing restores onGround');
});

test('AC-2: win on goal overlap — holding right wins L_FLAT at exactly step 67 (run-derived), checked AFTER integration; won stays true afterwards', () => {
  const world = createWorld(L_FLAT);
  for (let s = 1; s <= 66; s++) {
    step(world,RIGHT);
    assert.equal(world.won, false, `not yet overlapping the goal tile at step ${s}`);
  }
  assert.equal(world.hero.x, 148, 'run-derived x one step before the win');
  step(world,RIGHT);
  assert.equal(world.won, true, 'hero AABB overlaps goal rect [160,176) at x=150 (150+12 > 160)');
  assert.equal(world.hero.x, 150, 'run-derived x at the winning step');
  assert.equal(world.hero.y, 34, 'still grounded at the winning step');
  for (let s = 0; s < 3; s++) {
    step(world,NO_INPUT);
    assert.equal(world.won, true, 'won stays true on subsequent steps');
  }
});

test('AC-2: no win without input — the same step count with all-false input leaves won===false and the hero at the settled spawn column', () => {
  const world = createWorld(L_FLAT);
  for (let s = 1; s <= 67; s++) step(world,NO_INPUT);
  assert.equal(world.won, false, 'no input ⇒ never reaches the goal');
  assert.equal(world.hero.x, 16, 'no input ⇒ x never changes');
  assert.equal(world.hero.y, 34, 'settled on the floor');
});

test('AC-2: E parses as an enemy SPAWN marker, not a solid tile — the parser records the spawn at the E cell and tile-collision treats that cell as non-solid (run-derived)', () => {
  // B3-F1 scope correction (SPEC D12): M1 owns only the tile/parser contract
  // for 'E'. This test must hold whether or not a later milestone spawns a
  // live enemy ENTITY at the marker (M3 does, with knockback), so it asserts
  // at the parser/tile-collision layer and never steps a world to a win
  // through the E column.
  const world = createWorld(L_E);
  assert.deepEqual(world.level.enemies, [{ tx: 3, ty: 2 }], 'parser records exactly one enemy spawn, at the E tile (3,2)');
  assert.equal(world.level.solidAt(3, 2), false, 'the E cell is NON-solid for tile-collision (a solid-E parse would fail this)');
  assert.equal(world.level.solidAt(3, 3), true, 'the floor tile directly under E is solid (contrast)');
});

test('hygiene: M1 sim sources are deterministic and DOM-free — no Date.now / Math.random / performance.now / setTimeout / DOM APIs', () => {
  const banned = /Date\.now|Math\.random|performance\.now|setTimeout|window\.|document\./;
  const files = [
    '../src/core/level.mjs',
    '../src/core/world.mjs',
    '../src/characters/robo.mjs',
    '../src/levels/demo.mjs',
  ];
  for (const rel of files) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(!banned.test(src), `${rel} must not use nondeterministic or DOM APIs`);
  }
});

test('structure: src/levels/demo.mjs declares WIN_INPUTS as exactly ONE plain-data line (the accept sed inversion targets it) — read as text, never imported here', () => {
  // NOTE: this must stay GREEN while the accept block's sed has rewritten the
  // line to `export const WIN_INPUTS = [];` — both shapes match the pattern.
  const src = readFileSync(new URL('../src/levels/demo.mjs', import.meta.url), 'utf8');
  const declLines = src.split('\n').filter((l) => l.startsWith('export const WIN_INPUTS = '));
  assert.equal(declLines.length, 1, 'exactly one `export const WIN_INPUTS = ` line');
  assert.match(
    declLines[0],
    /^export const WIN_INPUTS = \[.*\];$/,
    'WIN_INPUTS is a single-line array literal (committed plain data)',
  );
});
