// test/combat.test.mjs — AC-4 acceptance tests (M3: enemies + combat).
//
// CONTRACT this file pins for the M3 public surface (the implementation MUST
// provide exactly this API — same authority as the world.test.mjs M1 header):
//
//   // src/core/enemy.mjs
//   //   export const ENEMY_PATROL_VX = 1;
//   //   A patroller is spawned by createWorld for every 'E' tile, in row-major
//   //   parse order, as an entry of world.enemies:
//   //     { x: tx*16, y: ty*16, w: 16, h: 16, vx: -ENEMY_PATROL_VX, defeated: false }
//   //   (16×16 hitbox fills its spawn tile exactly — bottom edge flush with the
//   //   floor tile below; initial direction is LEFT). The patroller has NO
//   //   gravity: y never changes; x is a pure function of the grid + step count.
//   //
//   //   Patrol step (one per world step; defeated enemies are skipped/inert):
//   //     next = x + vx
//   //     lead = vx > 0 ? next + w - 1 : next          // leading-edge pixel after the move
//   //     col  = floor(lead/16); row = floor(y/16)     // tile-aligned ⇒ exactly one row
//   //     wallAhead  = solidAt(col, row)
//   //     ledgeAhead = !solidAt(col, row + 1)          // floor tile below-and-ahead empty
//   //     if (wallAhead || ledgeAhead) vx = -vx        // reverse AND HOLD (no move this step)
//   //     else x = next
//   //
//   // src/core/world.mjs (RED edit) — combat resolution, new exports:
//   //   export const STOMP_BOUNCE_VY = -8;
//   //   export const INVULN_FRAMES = 30;
//   //   export const KNOCKBACK_VX = 2;
//   //   createWorld additionally provides: world.enemies (array as above, entries
//   //   PERSIST after defeat with defeated===true), world.lost === false, and
//   //   world.hero.hp === 3 (hero spawns with 3 hp).
//   //
//   //   step(world, input) frame order (extends the frozen M1/M2 order):
//   //     1) capture prevBottom = hero.y + hero.h          (hero bottom edge, previous step)
//   //     2) hero input — BUT while the knockback window is active, left/right are
//   //        ignored (masked) and after applyInput hero.vx is FORCED to the stored
//   //        knockback velocity; the window counter decrements once per step here.
//   //        fire / jump / slide inputs are NOT masked (the hero can still shoot).
//   //     3) gravity, 4) hero move+collide, 5) projectiles step + removal (unchanged)
//   //     6) enemies patrol (rule above)
//   //     7) combat resolution per living enemy, post-move AABBs, in this order:
//   //        a) projectile ∩ enemy  ⇒ enemy.defeated = true AND the projectile is
//   //           consumed (removed from world.projectiles within this same step).
//   //        b) hero ∩ enemy — STOMP (SPEC D7, checked BEFORE side damage):
//   //           hero.vy > 0 AND prevBottom <= enemy.y  ⇒ enemy.defeated = true,
//   //           hero.vy = STOMP_BOUNCE_VY(-8), NO hp loss. Stomps work during i-frames.
//   //        c) else SIDE CONTACT (only when no i-frames are active):
//   //           hero.hp -= 1; i-frame/knockback window = INVULN_FRAMES(30) steps;
//   //           knock direction = away from the enemy (heroCenterX < enemyCenterX
//   //           ⇒ -1 else +1); hero.vx = dir * KNOCKBACK_VX(2) immediately
//   //           (observable at the end of the hit step T) and FORCED on every step
//   //           T+1 .. T+30 (exactly 30 forced steps; step T+31 obeys input again);
//   //           hp reaching 0 ⇒ world.lost = true (sticky).
//   //     8) win check (unchanged).
//
// FREEZE RULES (SPEC D10/D12):
//   - Every expected literal below was derived by RUNNING the contract above as a
//     headless sim layered on the real frozen M0–M2 modules (physics/collision/
//     level/registry/projectile/robo), never hand-computed; the hero-side
//     arithmetic (settle y=34 in 2 steps, MOVE_VX=2, release-frame projectile
//     spawn x = hero.x + 12 + 6, muzzle y = hero.y + 6) cross-checks against the
//     frozen world.test.mjs / abilities.test.mjs literals.
//   - Scenarios use INLINE level literals ONLY (SPEC D12) — this file MUST NOT
//     import src/levels/demo.mjs (demo v2 is exercised by combat.smoke.mjs).
//   - All assertions are exact integers / exact booleans — never ranges.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createWorld, step, STOMP_BOUNCE_VY, INVULN_FRAMES, KNOCKBACK_VX } from '../src/core/world.mjs';
import { ENEMY_PATROL_VX } from '../src/core/enemy.mjs';

// Complete SPEC-D4 input records — exactly {left,right,jump,fire,slide}.
const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, fire: false, slide: false });
const RIGHT = Object.freeze({ ...NO_INPUT, right: true });
const LEFT = Object.freeze({ ...NO_INPUT, left: true });
const FIRE = Object.freeze({ ...NO_INPUT, fire: true });
const FIRE_RIGHT = Object.freeze({ ...NO_INPUT, right: true, fire: true });

// Walled patrol room. E at (2,1) ⇒ enemy spawn (32,16); walls at tx=0 and tx=5
// in the enemy's row ⇒ patrol x ping-pongs over [16,64]. Hero settles on top of
// the left wall (x=0, y=2) and never touches the enemy (hero bottom edge 16 ==
// enemy top 16, exclusive ⇒ no overlap).
const L_PATROL = [
  'S....G',
  '#.E..#',
  '######',
];

// Ledge patrol strip. E at (1,1) ⇒ enemy spawn (16,16); floor exists only at
// tx 1..3 of row 2 ⇒ BOTH reversals are caused by the ledge check (no walls in
// the enemy's row): patrol x ping-pongs over [16,48]. Hero falls down column 0
// to y=34 (out-of-bounds tiles are solid) and never overlaps the enemy.
const L_LEDGE = [
  'S....G',
  '.E....',
  '.###..',
];

// Stomp room. Hero spawns at (1,0) and free-falls; E at (2,3) ⇒ enemy spawn
// (32,48) walking left under the falling hero. First overlap is at step 8 with
// hero.vy=8>0 and previous-step hero bottom 42 <= enemy top 48 ⇒ STOMP.
const L_STOMP = [
  '.S....',
  '......',
  '......',
  '..E..G',
  '######',
];

// Shooting gallery. Hero settles at (0,34) facing +1 by default; E at (4,2) ⇒
// enemy spawn (64,32) walking left toward the hero. A tap-released shot
// (muzzle y=40 inside the enemy's [32,48) band) catches the enemy at step 15.
const L_SHOOT = [
  'S......',
  '.......',
  '....E.G',
  '#######',
];

// Side-contact runway (width 16). S at (8,2) ⇒ hero settles at x=128, y=34;
// E at (12,2) ⇒ enemy spawn (192,32) walking left. Holding RIGHT from step 3,
// first overlap is at step 19 (hero right edge 174 > enemy left 173) with
// hero.vy===0 ⇒ SIDE contact, knocked LEFT (hero center 168 < enemy center 181).
const L_SIDE = [
  '................',
  '................',
  '........S...E..G',
  '################',
];

// Mirror of L_SIDE for the opposite knock sign: hero settles at (128,34) and
// walks LEFT into the enemy's right side. The enemy (spawn x=48, walking left)
// wall-reverses at x=0 (out-of-bounds solid) and meets the hero head-on at
// step 56 (hero x=20, enemy x=7 heading right) ⇒ hero center 26 > enemy
// center 15 ⇒ knocked RIGHT (+1). No goal needed (win check skips when G absent).
const L_SIDE_LEFT = [
  '................',
  '................',
  '...E....S.......',
  '################',
];

// Sealed pocket: hero (x=16, settles y=18) and enemy (spawn x=48) share the
// one-tile-high corridor between walls at tx=0 and tx=5; the enemy ping-pongs
// over [16,64] (period 98) and re-hits the stationary hero every pass:
// run-derived hits at steps 21, 119 and 217 ⇒ hp 3→2→1→0 ⇒ lost. The G at
// (4,1) is non-solid and never reached during the hit phase (hero pinned at
// x=16 throughout) — it exists for the post-lost win-block walk.
const L_LOST = [
  '######',
  '#S.EG#',
  '######',
];

// Two-enemy combo room. Hero settles on the platform (row 3, tx 6..13) at
// (96,34). Enemy A — E at (10,2), spawn (160,32) — patrols the platform and
// side-hits the hero at step 53; the knockback (vx=-2, window steps 54..83)
// carries the hero off the platform's left edge at step 59; he falls onto
// enemy B — E at (8,5), spawn (128,80), walking left on the bottom floor —
// and STOMPS it at step 66, mid-i-frames (vy=8>0, prev bottom 76 <= 80).
const L_COMBO = [
  '..............',
  '..............',
  '......S...E...',
  '......########',
  '..............',
  '........E.....',
  '##############',
];

test('AC-4 surface: pinned constants and the enemy entity spawned from the E tile (16x16, tile-aligned, vx=-1, defeated=false); hero spawns with hp=3; world.lost===false', () => {
  assert.equal(ENEMY_PATROL_VX, 1, 'ENEMY_PATROL_VX (src/core/enemy.mjs)');
  assert.equal(STOMP_BOUNCE_VY, -8, 'STOMP_BOUNCE_VY (src/core/world.mjs)');
  assert.equal(INVULN_FRAMES, 30, 'INVULN_FRAMES (src/core/world.mjs)');
  assert.equal(KNOCKBACK_VX, 2, 'KNOCKBACK_VX (src/core/world.mjs)');

  const world = createWorld(L_PATROL);
  assert.ok(Array.isArray(world.enemies), 'world.enemies is an array');
  assert.equal(world.enemies.length, 1, 'exactly one enemy per E tile');
  const e = world.enemies[0];
  assert.equal(e.x, 32, 'spawn x = E tile tx*16 = 2*16');
  assert.equal(e.y, 16, 'spawn y = E tile ty*16 = 1*16 (16x16 body fills the tile)');
  assert.equal(e.w, 16, 'enemy hitbox width');
  assert.equal(e.h, 16, 'enemy hitbox height');
  assert.equal(e.vx, -1, 'initial patrol direction is LEFT (-ENEMY_PATROL_VX)');
  assert.equal(e.defeated, false, 'spawns alive');
  assert.equal(world.hero.hp, 3, 'hero spawns with 3 hp');
  assert.equal(world.lost, false, 'a fresh world is not lost');
  assert.equal(world.won, false, 'a fresh world is not won');
});

test('AC-4 patrol/wall: exact positions after K steps — walks left to x=16 (step 16), reverse-AND-HOLD on the wall (step 17: x=16, vx=+1), walks right to x=64 (step 65), reverses on the far wall (step 66), returns (step 67: x=63)', () => {
  const world = createWorld(L_PATROL);
  const e = world.enemies[0];
  step(world, NO_INPUT);
  assert.equal(e.x, 31, 'step 1: one px left (ENEMY_PATROL_VX=1)');
  assert.equal(e.y, 16, 'patroller has no gravity — y never changes');
  for (let s = 2; s <= 16; s++) step(world, NO_INPUT);
  assert.equal(e.x, 16, 'step 16: flush against the left wall (tile 0 ends at px 16)');
  assert.equal(e.vx, -1, 'still heading left — reversal happens on the NEXT (blocked) step');
  step(world, NO_INPUT);
  assert.equal(e.x, 16, 'step 17: blocked by the wall ⇒ reverse and hold (no move)');
  assert.equal(e.vx, 1, 'step 17: direction flipped by wall contact');
  step(world, NO_INPUT);
  assert.equal(e.x, 17, 'step 18: first px of the rightward leg');
  for (let s = 19; s <= 65; s++) step(world, NO_INPUT);
  assert.equal(e.x, 64, 'step 65: flush against the right wall (64+16 = wall left edge 80)');
  assert.equal(e.vx, 1);
  step(world, NO_INPUT);
  assert.equal(e.x, 64, 'step 66: blocked by the right wall ⇒ reverse and hold');
  assert.equal(e.vx, -1);
  step(world, NO_INPUT);
  assert.equal(e.x, 63, 'step 67: heading left again');
  assert.equal(e.y, 16, 'y still untouched after a full wall-to-wall lap');
  assert.equal(world.hero.hp, 3, 'patrol never touched the hero');
});

test('AC-4 patrol/ledge: exact positions after K steps — BOTH reversals caused by an empty floor tile ahead (no walls in the row): step 1 reverses at the left ledge (x=16), step 33 reaches x=48, step 34 reverses at the right ledge, step 35: x=47', () => {
  const world = createWorld(L_LEDGE);
  const e = world.enemies[0];
  assert.equal(e.x, 16, 'spawn at the E tile (1,1)');
  step(world, NO_INPUT);
  assert.equal(e.x, 16, 'step 1: tile below-and-ahead (0,2) is empty ⇒ reverse and hold');
  assert.equal(e.vx, 1, 'step 1: ledge reversal flips the direction');
  step(world, NO_INPUT);
  assert.equal(e.x, 17, 'step 2: walking right over the solid strip');
  for (let s = 3; s <= 33; s++) step(world, NO_INPUT);
  assert.equal(e.x, 48, 'step 33: last supported column (floor tiles tx 1..3 end at px 64)');
  assert.equal(e.vx, 1);
  step(world, NO_INPUT);
  assert.equal(e.x, 48, 'step 34: tile below-and-ahead (4,2) is empty ⇒ reverse and hold');
  assert.equal(e.vx, -1, 'step 34: second ledge reversal');
  step(world, NO_INPUT);
  assert.equal(e.x, 47, 'step 35: heading left again');
  assert.equal(e.y, 16, 'the patroller never falls off — y is constant (pure grid function)');
});

test('AC-4 stomp (SPEC D7): falling hero with prev-step bottom <= enemy top defeats the enemy, sets hero vy = STOMP_BOUNCE_VY(-8), and costs NO hp; the corpse is inert (frozen in place, no contact damage, hero rests overlapping it)', () => {
  const world = createWorld(L_STOMP);
  const e = world.enemies[0];
  assert.equal(e.x, 32);
  assert.equal(e.y, 48);
  for (let s = 1; s <= 7; s++) step(world, NO_INPUT);
  assert.equal(world.hero.y, 28, 'step 7: still above the enemy (bottom 42 <= enemy top 48)');
  assert.equal(world.hero.vy, 7, 'falling');
  assert.equal(e.defeated, false, 'no overlap yet');
  step(world, NO_INPUT);
  assert.equal(e.defeated, true, 'step 8: first overlap while falling from above ⇒ stomp');
  assert.equal(e.x, 24, 'enemy had walked to x=24 by the stomp step');
  assert.equal(world.hero.vy, -8, 'stomp sets hero vy = STOMP_BOUNCE_VY');
  assert.equal(world.hero.y, 36, 'hero position at the stomp step (run-derived)');
  assert.equal(world.hero.hp, 3, 'a stomp never costs hp');
  assert.equal(world.lost, false);
  step(world, NO_INPUT);
  assert.equal(world.hero.vy, -7, 'step 9: the bounce is real — gravity acts on vy=-8');
  assert.equal(world.hero.y, 29, 'step 9: rising (run-derived)');
  for (let s = 10; s <= 40; s++) step(world, NO_INPUT);
  assert.equal(world.hero.y, 50, 'hero lands on the floor THROUGH the corpse tile band');
  assert.equal(world.hero.hp, 3, 'resting overlapped with the defeated enemy costs nothing');
  assert.equal(e.x, 24, 'defeated enemy never patrols again');
  assert.equal(world.lost, false);
});

test('AC-4 projectile: a shot overlapping an enemy defeats it AND is consumed the same step; the defeated enemy is inert thereafter (no patrol, no contact damage)', () => {
  const world = createWorld(L_SHOOT);
  const e = world.enemies[0];
  for (let s = 1; s <= 8; s++) step(world, NO_INPUT); // settle at x=0, y=34
  assert.equal(world.hero.y, 34, 'settled (run-derived)');
  step(world, FIRE); // held frame — no spawn (frozen M2 contract)
  assert.equal(world.projectiles.length, 0, 'no projectile while fire is held');
  step(world, NO_INPUT); // release frame — spawn + first flight step
  assert.equal(world.projectiles.length, 1, 'release frame spawns exactly one shot');
  assert.equal(world.projectiles[0].x, 18, 'muzzle x 12 already advanced by vx 6 (frozen M2 contract)');
  assert.equal(world.projectiles[0].y, 40, 'muzzle y inside the enemy band [32,48)');
  for (let s = 11; s <= 14; s++) step(world, NO_INPUT);
  assert.equal(world.projectiles[0].x, 42, 'step 14: shot right edge 46 < enemy left 50 — no hit yet');
  assert.equal(e.defeated, false);
  step(world, NO_INPUT);
  assert.equal(e.defeated, true, 'step 15: shot [48,52) overlaps enemy [49,65) ⇒ defeated');
  assert.equal(world.projectiles.length, 0, 'the projectile is CONSUMED (removed) the same step');
  assert.equal(e.x, 49, 'enemy position at the kill step');
  assert.equal(world.hero.hp, 3, 'shooting costs no hp');
  for (let s = 16; s <= 60; s++) step(world, NO_INPUT);
  assert.equal(e.x, 49, 'corpse frozen — a live enemy would have reached x=4 by step 60');
  assert.equal(world.hero.hp, 3, 'a live enemy would overlap the hero at step 60; the corpse does not damage');
  assert.equal(world.lost, false);
});

test('AC-4 side contact + knockback (SPEC D8): hp-1; hero vx forced to exactly -KNOCKBACK_VX(-2), away from the enemy, for exactly the full INVULN_FRAMES(30) window with RIGHT held and ignored; input is honored again on the 31st step', () => {
  const world = createWorld(L_SIDE);
  step(world, NO_INPUT);
  step(world, NO_INPUT); // settle: x=128, y=34
  for (let s = 3; s <= 18; s++) step(world, RIGHT);
  assert.equal(world.hero.x, 160, 'step 18: one step short of contact (right edge 172 < enemy left 174)');
  assert.equal(world.hero.hp, 3, 'no damage yet');
  step(world, RIGHT); // step 19 — the hit
  assert.equal(world.hero.hp, 2, 'side contact costs exactly 1 hp');
  assert.equal(world.hero.x, 162, 'movement had already happened this step (combat resolves post-move)');
  assert.equal(world.hero.vx, -2, 'knockback vx = -KNOCKBACK_VX, AWAY from the enemy, set on the hit step');
  assert.equal(world.enemies[0].defeated, false, 'side contact never defeats the enemy');
  assert.equal(world.lost, false, 'hp 2 > 0');
  // Forced window: steps 20..49 move the hero -2 px/step although RIGHT is held.
  step(world, RIGHT);
  assert.equal(world.hero.x, 160, 'step 20: RIGHT ignored, knocked 2 px left');
  assert.equal(world.hero.vx, -2);
  for (let s = 21; s <= 35; s++) step(world, RIGHT);
  assert.equal(world.hero.x, 130, 'step 35: mid-window, still -2 px/step (162 - 2*16)');
  assert.equal(world.hero.vx, -2);
  for (let s = 36; s <= 49; s++) step(world, RIGHT);
  assert.equal(world.hero.x, 102, 'step 49: the 30th and LAST forced step (162 - 2*30)');
  assert.equal(world.hero.vx, -2, 'still knocked back on the final window step');
  assert.equal(world.hero.hp, 2, 'no re-damage during the window');
  step(world, RIGHT);
  assert.equal(world.hero.x, 104, 'step 50: window over — RIGHT moves the hero again');
  assert.equal(world.hero.vx, 2, 'input-driven vx restored to +MOVE_VX');
  step(world, RIGHT);
  assert.equal(world.hero.x, 106, 'step 51: free movement continues');
  assert.equal(world.hero.hp, 2);
  assert.equal(world.lost, false);
});

test('AC-4 side contact from the LEFT: a hit on the hero\'s left side knocks RIGHT — vx === +KNOCKBACK_VX(+2) on EVERY one of the 30 window steps with LEFT held and ignored; LEFT works again on the 31st step (all literals from the L_SIDE_LEFT deriving run)', () => {
  const world = createWorld(L_SIDE_LEFT);
  const e = world.enemies[0];
  step(world, NO_INPUT);
  step(world, NO_INPUT); // settle: x=128, y=34
  assert.equal(world.hero.x, 128, 'settled at the S tile column (run-derived)');
  for (let s = 3; s <= 55; s++) step(world, LEFT);
  assert.equal(world.hero.x, 22, 'step 55: one step short of contact (128 - 2*53)');
  assert.equal(world.hero.hp, 3, 'no damage yet');
  step(world, LEFT); // step 56 — head-on hit
  assert.equal(world.hero.hp, 2, 'side contact costs exactly 1 hp');
  assert.equal(world.hero.x, 20, 'movement happened pre-combat on the hit step');
  assert.equal(e.x, 7, 'enemy position at the hit step (heading right after its x=0 wall reversal)');
  assert.equal(e.vx, 1, 'enemy approaching from the LEFT');
  assert.equal(world.hero.vx, 2, 'knockback vx = +KNOCKBACK_VX — exact opposite sign of the right-side hit');
  for (let s = 57; s <= 86; s++) {
    step(world, LEFT);
    assert.equal(world.hero.vx, 2, `forced +2 on EVERY window step (step ${s})`);
  }
  assert.equal(world.hero.x, 80, 'step 86: 30 forced steps, 20 + 2*30');
  assert.equal(world.hero.hp, 2, 'no re-damage during the window');
  step(world, LEFT);
  assert.equal(world.hero.x, 78, 'step 87: window over — LEFT moves the hero again');
  assert.equal(world.hero.vx, -2, 'input-driven vx restored to -MOVE_VX');
  assert.equal(world.lost, false);
});

test('AC-4 fire during i-frames: left/right are masked but FIRE is not — a shot released mid-knockback defeats the enemy while the hero keeps getting knocked back', () => {
  const world = createWorld(L_SIDE);
  step(world, NO_INPUT);
  step(world, NO_INPUT);
  for (let s = 3; s <= 19; s++) step(world, RIGHT); // hit at step 19 (hp 3→2)
  assert.equal(world.hero.hp, 2);
  step(world, FIRE_RIGHT); // step 20: hold fire inside the window
  assert.equal(world.projectiles.length, 0, 'held frame — no spawn, even during i-frames');
  assert.equal(world.hero.x, 160, 'knockback still in force on the held frame');
  step(world, RIGHT); // step 21: release ⇒ shot spawns at x=172, flies to 178, hits enemy [171,187)
  assert.equal(world.enemies[0].defeated, true, 'the mid-knockback shot defeats the enemy');
  assert.equal(world.projectiles.length, 0, 'consumed on the kill step');
  assert.equal(world.hero.hp, 2, 'projectile kills cost no hp');
  assert.equal(world.hero.x, 158, 'knockback movement unaffected by firing');
  assert.equal(world.hero.vx, -2);
  step(world, RIGHT); // step 22
  assert.equal(world.hero.x, 156, 'the window keeps running even after the enemy died');
  assert.equal(world.lost, false);
});

test('AC-4 stomp during i-frames: knocked off a ledge by enemy A, the falling hero STOMPS enemy B mid-window — B defeated, vy=-8, and NO additional hp loss', () => {
  const world = createWorld(L_COMBO);
  const [a, b] = world.enemies;
  assert.equal(a.x, 160, 'enemies parse row-major: A is the platform patroller');
  assert.equal(b.x, 128, 'B walks the bottom floor');
  for (let s = 1; s <= 52; s++) step(world, NO_INPUT);
  assert.equal(world.hero.hp, 3, 'step 52: A (x=108) not yet touching the hero (right edge 108)');
  step(world, NO_INPUT); // step 53 — A side-hits the hero
  assert.equal(world.hero.hp, 2, 'side hit from A');
  assert.equal(world.hero.vx, -2, 'knocked LEFT, away from A');
  assert.equal(a.defeated, false);
  for (let s = 54; s <= 59; s++) step(world, NO_INPUT);
  assert.equal(world.hero.x, 84, 'step 59: knocked past the platform left edge (px 96)');
  assert.equal(world.hero.y, 35, 'step 59: airborne — falling has begun');
  for (let s = 60; s <= 65; s++) step(world, NO_INPUT);
  assert.equal(world.hero.y, 62, 'step 65: prev bottom 76 <= B top 80 — the D7 precondition for next step');
  assert.equal(b.defeated, false);
  step(world, NO_INPUT); // step 66 — stomp B mid-i-frames
  assert.equal(b.defeated, true, 'stomp works during the invulnerability window');
  assert.equal(world.hero.vy, -8, 'stomp bounce mid-window');
  assert.equal(world.hero.hp, 2, 'the stomp costs nothing — hp unchanged since the step-53 hit');
  assert.equal(a.defeated, false, 'A is still alive');
  assert.equal(world.lost, false);
  step(world, NO_INPUT);
  assert.equal(world.hero.vy, -7, 'step 67: bouncing');
});

test('AC-4 hp 0 => lost: a trapped hero is hit on every patrol pass (steps 21, 119, 217 — run-derived, period 98) with full i-frame immunity in between; the third hit sets world.lost===true, it stays true, and the win check no longer triggers on goal overlap', () => {
  const world = createWorld(L_LOST);
  assert.equal(world.hero.hp, 3);
  for (let s = 1; s <= 20; s++) step(world, NO_INPUT);
  assert.equal(world.hero.hp, 3, 'step 20: enemy left edge 28 not yet inside the hero [16,28)');
  step(world, NO_INPUT); // step 21 — hit 1
  assert.equal(world.hero.hp, 2, 'hit 1 at step 21');
  assert.equal(world.hero.vx, -2, 'knocked into the wall (vx set away from the enemy)');
  assert.equal(world.lost, false);
  // The enemy stays overlapped with the hero through step 44 — i-frames must
  // absorb every one of those steps (a single missing i-frame re-damages here).
  for (let s = 22; s <= 51; s++) {
    step(world, NO_INPUT);
    assert.equal(world.hero.hp, 2, `no re-damage during the i-frame window (step ${s})`);
  }
  for (let s = 52; s <= 118; s++) step(world, NO_INPUT);
  assert.equal(world.hero.hp, 2, 'step 118: the enemy is back at x=28, one px short');
  step(world, NO_INPUT); // step 119 — hit 2
  assert.equal(world.hero.hp, 1, 'hit 2 exactly one patrol period (98 steps) later');
  assert.equal(world.lost, false);
  for (let s = 120; s <= 216; s++) step(world, NO_INPUT);
  assert.equal(world.hero.hp, 1, 'step 216: still alive');
  assert.equal(world.lost, false);
  step(world, NO_INPUT); // step 217 — hit 3
  assert.equal(world.hero.hp, 0, 'hit 3 drains the last hp');
  assert.equal(world.lost, true, 'hp 0 ⇒ lost === true');
  for (let s = 218; s <= 220; s++) step(world, NO_INPUT);
  assert.equal(world.lost, true, 'lost is sticky');
  assert.equal(world.hero.hp, 0, 'hp never goes below 0 in observable steps');
  // Win no longer triggers after lost: wait out the final window (steps
  // 221..247), shoot the enemy dead, then walk onto the goal at (4,1).
  for (let s = 221; s <= 247; s++) step(world, NO_INPUT);
  assert.equal(world.hero.vx, 0, 'step 247: window fully expired');
  step(world, FIRE); // step 248 — press
  assert.equal(world.projectiles.length, 0, 'held frame — no spawn');
  step(world, NO_INPUT); // step 249 — release: shot [34,38) meets enemy [36,52)
  assert.equal(world.enemies[0].defeated, true, 'step 249: release-frame shot kills the enemy (run-derived)');
  assert.equal(world.projectiles.length, 0, 'consumed on the kill step');
  for (let s = 250; s <= 268; s++) step(world, RIGHT);
  assert.equal(world.hero.x, 54, 'step 268: first goal overlap (54+12 > gx 64, run-derived)');
  assert.equal(world.won, false, 'win does NOT trigger while lost');
  for (let s = 269; s <= 273; s++) step(world, RIGHT);
  assert.equal(world.hero.x, 64, 'step 273: hero fully inside the goal tile [64,80)');
  assert.equal(world.won, false, 'won stays false on every goal-overlap step after lost');
  assert.equal(world.lost, true, 'lost still sticky');
  assert.equal(world.hero.hp, 0);
});

test('hygiene: src/core/enemy.mjs is deterministic and DOM-free — no Date.now / Math.random / performance.now / setTimeout / DOM APIs', () => {
  const banned = /Date\.now|Math\.random|performance\.now|setTimeout|window\.|document\./;
  const src = readFileSync(new URL('../src/core/enemy.mjs', import.meta.url), 'utf8');
  assert.ok(!banned.test(src), 'src/core/enemy.mjs must not use nondeterministic or DOM APIs');
});
