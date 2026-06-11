// test/abilities.test.mjs — AC-3 acceptance tests (M2: Rivet's ranged kit —
// arm-cannon, charge shot, slide) + projectile lifecycle.
//
// CONTRACT this file pins on top of the frozen M1 world surface (the
// implementation MUST provide exactly this behavior):
//
//   // src/core/world.mjs
//   //   createWorld(rows) now builds the hero via createCharacter('robo')
//   //   (src/characters/robo.mjs self-registers on import, reachable from
//   //   world.mjs's import graph) and exposes:
//   //     world.projectiles — array, [] on a fresh world; step(world, input)
//   //     advances every live projectile by its vx each frame (straight
//   //     horizontal flight — no gravity on shots) and REMOVES a projectile
//   //     when it hits a solid tile (out-of-bounds counts as solid).
//   //
//   // Arm-cannon / charge shot (SPEC D3: PROJ_VX=6, PROJ_DMG=1,
//   // CHARGE_FRAMES=30, CHARGED_DMG=3):
//   //   - A step with input.fire===true increments the held-counter; NO
//   //     projectile spawns while fire is held.
//   //   - The projectile spawns on the RELEASE frame — the first step where
//   //     fire is false after >=1 held frame. Exactly ONE projectile per
//   //     press→release cycle, with vx = facing*6 and dmg = 1, or dmg = 3
//   //     when the counter reached >=30 (held 29 ⇒ dmg 1; held 30 ⇒ dmg 3).
//   //     The counter resets after the release.
//   //   - facing: +1 after a step with input.right, -1 after input.left;
//   //     it persists across neutral frames.
//   //
//   // Slide (SPEC D3: NORMAL_H=14, SLIDE_H=8, SLIDE_VX=4, SLIDE_FRAMES=20):
//   //   - input.slide on a grounded frame starts a slide: for exactly 20
//   //     observed steps (the press frame is step 1) the hitbox is h=8 with
//   //     the BOTTOM edge unchanged (y = settledY+6) and vx is LOCKED to
//   //     facing*4 — left/right input and new slide presses are IGNORED
//   //     until the 20 frames elapse. On step 21 the height restores
//   //     (h=14, y back to settledY) and input control returns.
//   //   - input.slide while airborne is IGNORED entirely (not queued).
//
// FREEZE RULES (SPEC D10 / plan v2 R1): every expected literal below is
// run-derived — settle/jump/move literals are validated by the frozen M1
// suite on identical level geometry (spawn row 2, floor top y=48 ⇒ settled
// y=34; jump frame ⇒ vy=-9, y=25); slide x-positions follow the pinned
// pixel-step collision core (open corridor, |vx| px/frame). Inline level
// literals ONLY; this file freezes at M2's first commit (oracle-integrity).
//
// All assertions are exact integers / exact booleans — never ranges (the one
// bounded search, projectile wall removal, asserts the exact post-conditions).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, step } from '../src/core/world.mjs';
import { createCharacter } from '../src/core/registry.mjs';
import { HERO_H, SLIDE_H, SLIDE_VX, SLIDE_FRAMES, CHARGE_FRAMES, CHARGED_DMG } from '../src/characters/robo.mjs';
import { PROJ_VX, PROJ_DMG } from '../src/core/projectile.mjs';

// Complete SPEC-D4 input records — exactly {left,right,jump,fire,slide}.
const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, fire: false, slide: false });
const RIGHT = Object.freeze({ ...NO_INPUT, right: true });
const LEFT = Object.freeze({ ...NO_INPUT, left: true });
const JUMP = Object.freeze({ ...NO_INPUT, jump: true });
const FIRE = Object.freeze({ ...NO_INPUT, fire: true });
const SLIDE = Object.freeze({ ...NO_INPUT, slide: true });

// Wide flat room. S at tile (1,2) → spawn (16,32); floor top edge y=48;
// settled hero top y = 48-14 = 34 (same geometry the frozen M1 suite pins).
const L_RANGE = [
  '........................',
  '........................',
  '.S......................',
  '########################',
];

// Mid-spawn room for facing-left tests. S at tile (12,2) → spawn (192,32).
const L_MID = [
  '........................',
  '........................',
  '............S..........G',
  '########################',
];

// Wall room for projectile removal. Solid column at tile x=12 (px 192..207).
const L_WALL = [
  '............#...',
  '............#...',
  '.S..........#..G',
  '################',
];

// Settle the freshly spawned hero onto the floor (run-derived: 2 neutral
// steps, y 32→33→34 — identical to the frozen M1 settle test).
function settle(world) {
  step(world, NO_INPUT);
  step(world, NO_INPUT);
  assert.equal(world.hero.y, 34, 'settled on the floor (precondition)');
  assert.equal(world.hero.onGround, true, 'grounded (precondition)');
}

test('AC-3 constants: the exported kit constants are EXACTLY the SPEC D3 values', () => {
  assert.equal(PROJ_VX, 6);
  assert.equal(PROJ_DMG, 1);
  assert.equal(CHARGE_FRAMES, 30);
  assert.equal(CHARGED_DMG, 3);
  assert.equal(SLIDE_H, 8);
  assert.equal(SLIDE_VX, 4);
  assert.equal(SLIDE_FRAMES, 20);
  assert.equal(HERO_H, 14);
});

test('AC-3 arm-cannon default facing: a fresh hero faces +1 — tap-release fire with NO prior direction input ⇒ one projectile, vx=+6, dmg=1; spawn x has ALREADY advanced by vx on the release frame (spawned in applyInput, stepped later the same world.step: 16+12+6=34)', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  assert.equal(world.hero.facing, 1, 'initial facing is +1 (run-derived)');

  step(world, FIRE); // held frame 1
  assert.equal(world.projectiles.length, 0, 'no spawn on the press frame');
  step(world, NO_INPUT); // release frame
  assert.equal(world.projectiles.length, 1);
  assert.equal(world.projectiles[0].vx, 6, 'default facing(+1) · PROJ_VX(6)');
  assert.equal(world.projectiles[0].dmg, 1);
  assert.equal(world.projectiles[0].x, 34, 'release-frame x = hero.x(16) + hero.w(12) + vx(6) — already stepped once');
  assert.equal(world.projectiles[0].y, 40, 'muzzle y = hero.y(34) + 7 - 1 (run-derived)');
});

test('AC-3: robo registration is reachable — importing world.mjs registers id "robo"; createCharacter("robo", x, y) spawns Rivet with the 12×14 hitbox', () => {
  const r = createCharacter('robo', 64, 80);
  assert.equal(r.x, 64);
  assert.equal(r.y, 80);
  assert.equal(r.w, 12, 'hero hitbox width (SPEC D3)');
  assert.equal(r.h, 14, 'hero hitbox height NORMAL_H (SPEC D3)');
  assert.equal(r.name, 'Rivet', 'hero display name (ORIGINAL ONLY)');
});

test('AC-3: world surface — a fresh world exposes an EMPTY projectiles array and the registry-built hero', () => {
  const world = createWorld(L_RANGE);
  assert.ok(Array.isArray(world.projectiles), 'world.projectiles is an array');
  assert.equal(world.projectiles.length, 0, 'no projectiles before any fire input');
  assert.equal(world.hero.w, 12);
  assert.equal(world.hero.h, 14);
  assert.equal(world.hero.name, 'Rivet');
});

test('AC-3 arm-cannon: tap fire — NO spawn on the press frame; exactly ONE projectile on the RELEASE frame with vx=+6 (facing right) and dmg=1, flying straight at 6px/step', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, RIGHT); // face right (x 16→18)
  assert.equal(world.hero.x, 18);

  step(world, FIRE); // held frame 1
  assert.equal(world.projectiles.length, 0, 'spawn happens on RELEASE, never on the press frame');

  step(world, NO_INPUT); // release frame
  assert.equal(world.projectiles.length, 1, 'exactly one projectile per press→release cycle');
  const p = world.projectiles[0];
  assert.equal(p.vx, 6, 'vx = facing(+1) · PROJ_VX(6)');
  assert.equal(p.dmg, 1, 'tap shot dmg = PROJ_DMG(1)');

  // Straight horizontal flight: +6px per step, y constant, no extra spawns.
  const px = p.x, py = p.y;
  for (let n = 1; n <= 3; n++) {
    step(world, NO_INPUT);
    assert.equal(world.projectiles.length, 1, 'neutral frames never spawn projectiles');
    assert.equal(world.projectiles[0].x, px + 6 * n, `projectile x after ${n} flight steps`);
    assert.equal(world.projectiles[0].y, py, 'arm-cannon shots fly horizontally (no gravity)');
  }

  // A second full cycle spawns a second projectile (counter reset per cycle).
  step(world, FIRE);
  assert.equal(world.projectiles.length, 1, 'still no spawn while fire is held');
  step(world, NO_INPUT);
  assert.equal(world.projectiles.length, 2, 'second press→release cycle ⇒ second projectile');
  assert.equal(world.projectiles[1].vx, 6);
  assert.equal(world.projectiles[1].dmg, 1);
});

test('AC-3 charge boundary LOW: fire held exactly 29 frames then released ⇒ dmg=1 (29 < CHARGE_FRAMES)', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, RIGHT); // face right

  for (let held = 1; held <= 29; held++) {
    step(world, FIRE);
    assert.equal(world.projectiles.length, 0, `no spawn while held (frame ${held})`);
  }
  step(world, NO_INPUT); // release after 29 held frames
  assert.equal(world.projectiles.length, 1);
  assert.equal(world.projectiles[0].dmg, 1, 'held 29 < 30 ⇒ uncharged dmg 1');
  assert.equal(world.projectiles[0].vx, 6);
});

test('AC-3 charge boundary HIGH: fire held exactly 30 frames then released ⇒ ONE projectile, dmg=CHARGED_DMG(3); next tap is dmg=1 again (counter resets)', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, RIGHT); // face right

  for (let held = 1; held <= 30; held++) {
    step(world, FIRE);
    assert.equal(world.projectiles.length, 0, `no spawn while held (frame ${held})`);
  }
  step(world, NO_INPUT); // release after 30 held frames
  assert.equal(world.projectiles.length, 1, 'NEVER two projectiles on a charged release');
  assert.equal(world.projectiles[0].dmg, 3, 'held 30 ≥ CHARGE_FRAMES(30) ⇒ charged dmg 3');
  assert.equal(world.projectiles[0].vx, 6);

  // Counter reset: an immediate tap-release after the charged shot is dmg 1.
  step(world, FIRE);
  assert.equal(world.projectiles.length, 1, 'no spawn on the new press frame');
  step(world, NO_INPUT);
  assert.equal(world.projectiles.length, 2);
  assert.equal(world.projectiles.filter((q) => q.dmg === 3).length, 1, 'exactly one charged shot');
  assert.equal(world.projectiles.filter((q) => q.dmg === 1).length, 1, 'the post-charge tap is uncharged (counter reset)');
});

test('AC-3 arm-cannon facing: after a left step the shot has vx=-6 and travels -6px/step', () => {
  const world = createWorld(L_MID);
  settle(world);
  assert.equal(world.hero.x, 192, 'spawn column (precondition)');
  step(world, LEFT); // face left (x 192→190)
  assert.equal(world.hero.x, 190);

  step(world, FIRE);
  step(world, NO_INPUT); // release
  assert.equal(world.projectiles.length, 1);
  assert.equal(world.projectiles[0].vx, -6, 'vx = facing(-1) · PROJ_VX(6)');
  assert.equal(world.projectiles[0].dmg, 1);
  const px = world.projectiles[0].x;
  step(world, NO_INPUT);
  assert.equal(world.projectiles[0].x, px - 6, 'left shot travels exactly -6px/step');
});

test('AC-3 projectile lifecycle: a shot fired at a solid wall is REMOVED on hit at an EXACT run-derived frame and never respawns', () => {
  const world = createWorld(L_WALL);
  settle(world);
  step(world, RIGHT); // face right toward the wall column at tile x=12 (px 192)
  assert.equal(world.hero.x, 18);
  step(world, FIRE);
  step(world, NO_INPUT); // release
  assert.equal(world.projectiles.length, 1, 'in flight after release');
  assert.equal(world.projectiles[0].x, 36, 'release-frame x = 18+12+6 (spawned in applyInput, already stepped once)');

  // Run-derived EXACT removal frame: x advances 36→42→…→186 over 25 in-flight
  // steps, then the 26th step would reach x=192 (the wall tile) ⇒ removed.
  for (let n = 1; n <= 25; n++) {
    step(world, NO_INPUT);
    assert.equal(world.projectiles.length, 1, `exactly one shot in flight (step ${n})`);
    assert.equal(world.projectiles[0].x, 36 + 6 * n, `x after ${n} flight steps`);
  }
  assert.equal(world.projectiles[0].x, 186, 'last in-flight x, 6px short of the wall');
  step(world, NO_INPUT); // step 26: x reaches 192 — inside the solid column
  assert.equal(world.projectiles.length, 0, 'removed on the EXACT wall-hit frame (step 26 after release)');
  for (let n = 1; n <= 3; n++) {
    step(world, NO_INPUT);
    assert.equal(world.projectiles.length, 0, 'stays removed; nothing respawns');
  }
});

test('AC-3 slide: press once while grounded ⇒ h 14→8 with bottom edge unchanged (y 34→40) and vx locked to +4 for EXACTLY 20 steps; step 21 restores h=14/y=34 and motion stops', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, RIGHT); // face right (x 16→18)
  assert.equal(world.hero.x, 18);
  assert.equal(world.hero.h, 14, 'NORMAL_H before the slide');

  // Step 1 = the press frame; the slide is then LOCKED — input.slide is NOT
  // held on steps 2..20, the slide continues regardless.
  step(world, SLIDE);
  for (let n = 1; n <= 20; n++) {
    if (n > 1) step(world, NO_INPUT);
    assert.equal(world.hero.h, 8, `SLIDE_H during slide step ${n}`);
    assert.equal(world.hero.y, 40, `bottom edge invariant (y = 34+6) during step ${n}`);
    assert.equal(world.hero.vx, 4, `vx = facing(+1)·SLIDE_VX(4) during step ${n}`);
    assert.equal(world.hero.x, 18 + 4 * n, `x advances exactly 4px/step (step ${n})`);
    assert.equal(world.hero.onGround, true, 'grounded throughout the slide');
  }
  assert.equal(world.hero.x, 98, 'total slide travel = 20·4 = 80px');

  // Step 21: height restores, bottom edge still on the floor, control returns.
  step(world, NO_INPUT);
  assert.equal(world.hero.h, 14, 'height restores on step 21');
  assert.equal(world.hero.y, 34, 'y restored so the bottom edge is unchanged');
  assert.equal(world.hero.x, 98, 'slide vx is gone — neutral input means no motion');
  assert.equal(world.hero.vx, 0);
  step(world, NO_INPUT);
  assert.equal(world.hero.x, 98, 'no residual slide motion afterwards');
});

test('AC-3 slide lock: left/right input is IGNORED for the full 20 frames; control returns on step 21', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, RIGHT); // face right (x=18)

  step(world, SLIDE); // step 1
  for (let n = 2; n <= 20; n++) step(world, LEFT); // held LEFT must be ignored
  assert.equal(world.hero.x, 98, 'x advanced +4/step for all 20 steps despite held LEFT');
  assert.equal(world.hero.vx, 4, 'vx still locked to +4 on slide step 20');
  assert.equal(world.hero.h, 8, 'still sliding on step 20');

  step(world, LEFT); // step 21: control restored
  assert.equal(world.hero.h, 14, 'height restored on step 21');
  assert.equal(world.hero.y, 34);
  assert.equal(world.hero.vx, -2, 'normal MOVE_VX(2) control returns after the slide');
  assert.equal(world.hero.x, 96, 'x = 98 - 2 on the first post-slide left step');
});

test('AC-3 slide lock: a NEW slide press mid-slide is IGNORED — the slide still ends after exactly 20 frames, no restart/extension', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, RIGHT); // face right (x=18)

  step(world, SLIDE); // step 1
  for (let n = 2; n <= 9; n++) step(world, NO_INPUT);
  step(world, SLIDE); // step 10: re-press, must be ignored
  for (let n = 11; n <= 20; n++) step(world, NO_INPUT);
  assert.equal(world.hero.h, 8, 'still sliding on step 20');
  assert.equal(world.hero.x, 98, 'x = 18 + 20·4 (a restart at step 10 would overshoot)');

  step(world, NO_INPUT); // step 21
  assert.equal(world.hero.h, 14, 'slide ended after exactly 20 frames despite the re-press');
  assert.equal(world.hero.y, 34);
  assert.equal(world.hero.x, 98, 'no extension past frame 20');
});

test('AC-3 slide facing: after a left step the slide runs at vx=-4 for exactly 20 frames (x 190→110), then restores', () => {
  const world = createWorld(L_MID);
  settle(world);
  step(world, LEFT); // face left (x 192→190)
  assert.equal(world.hero.x, 190);

  step(world, SLIDE);
  for (let n = 1; n <= 20; n++) {
    if (n > 1) step(world, NO_INPUT);
    assert.equal(world.hero.h, 8, `SLIDE_H during slide step ${n}`);
    assert.equal(world.hero.y, 40, `bottom edge invariant during step ${n}`);
    assert.equal(world.hero.vx, -4, `vx = facing(-1)·SLIDE_VX(4) during step ${n}`);
    assert.equal(world.hero.x, 190 - 4 * n, `x retreats exactly 4px/step (step ${n})`);
  }
  assert.equal(world.hero.x, 110, 'total leftward slide travel = 80px');

  step(world, NO_INPUT); // step 21
  assert.equal(world.hero.h, 14);
  assert.equal(world.hero.y, 34);
  assert.equal(world.hero.x, 110);
});

test('AC-3 slide grounding: input.slide while AIRBORNE is ignored entirely — h stays 14 through the air, the landing, and beyond (nothing queued)', () => {
  const world = createWorld(L_RANGE);
  settle(world);
  step(world, JUMP); // airborne (run-derived: vy=-9, y=25 — matches the frozen M1 jump arithmetic)
  assert.equal(world.hero.y, 25);
  assert.equal(world.hero.onGround, false);

  step(world, SLIDE); // airborne slide press: ignored
  assert.equal(world.hero.h, 14, 'airborne slide does not shrink the hitbox');
  assert.equal(world.hero.vx, 0, 'airborne slide does not impart SLIDE_VX');
  step(world, SLIDE); // still airborne, still ignored
  assert.equal(world.hero.h, 14);
  assert.equal(world.hero.vx, 0);

  // Ride the (deterministic) arc back to the floor; the hitbox never changes
  // and no queued slide triggers on landing.
  let frames = 0;
  while (!world.hero.onGround && frames < 60) {
    step(world, NO_INPUT);
    assert.equal(world.hero.h, 14, 'hitbox unchanged for the whole arc');
    frames += 1;
  }
  assert.equal(world.hero.onGround, true, 'landed within the bound');
  assert.equal(world.hero.y, 34, 'settled back on the floor');
  step(world, NO_INPUT);
  assert.equal(world.hero.h, 14, 'no queued slide fires after landing');
  assert.equal(world.hero.y, 34);
});
