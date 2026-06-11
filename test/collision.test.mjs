// test/collision.test.mjs — AC-1b / AC-1c / AC-1d acceptance tests (M0 oracle).
//
// CONTRACT this file pins for src/core/collision.mjs (the implementation MUST
// export exactly this public API):
//
//   // moveAndCollide(body, solidAt)
//   //   body: { x, y, w, h, vx, vy } — integers only.
//   //   The body occupies the half-open pixel rectangle [x, x+w) × [y, y+h),
//   //   so a body with y + h === floorTy*TILE rests ON the floor, not in it.
//   //   solidAt(tx, ty) -> truthy when the tile at column tx / row ty is solid.
//   //
//   //   Semantics (SPEC D2 / AC-1):
//   //   - Resets all four contact flags to false, then resolves the X axis
//   //     FULLY before the Y axis.
//   //   - Any axis move with |v| >= TILE(16) is sub-stepped — no tunnelling
//   //     through 1-tile-thick walls/floors.
//   //   - On contact the position is clamped to the contacted tile edge and
//   //     the velocity on that axis is set to 0:
//   //       moving right into wall  -> x = wallTx*16 - w,    onWallR = true
//   //       moving left  into wall  -> x = (wallTx+1)*16,    onWallL = true
//   //       moving down  into floor -> y = floorTy*16 - h,   onGround = true
//   //       moving up    into ceil  -> y = (ceilTy+1)*16,    onCeiling = true
//   //   - Flags are recomputed every call (a contact-free call leaves all four
//   //     flags === false). Mutates and returns body.
//   export function moveAndCollide(body, solidAt)
//
// All assertions are exact integers — never ranges or approximations.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moveAndCollide } from '../src/core/collision.mjs';

// Build a solidAt(tx,ty) callback from row strings ('#' = solid tile).
// Anything outside the map is empty.
function gridFrom(rows) {
  return (tx, ty) => {
    if (ty < 0 || ty >= rows.length) return false;
    if (tx < 0 || tx >= rows[ty].length) return false;
    return rows[ty][tx] === '#';
  };
}

function assertFlags(body, expected) {
  for (const flag of ['onGround', 'onCeiling', 'onWallL', 'onWallR']) {
    assert.equal(body[flag], expected[flag], `${flag} flag`);
  }
}

// ---------------------------------------------------------------------------
// AC-1b: each contact flag true in a dedicated scenario, false otherwise.
// ---------------------------------------------------------------------------

test('AC-1b: onGround — falling body clamps to the floor top edge; only onGround is true', () => {
  const solidAt = gridFrom([
    '....',
    '....',
    '####',
  ]);
  const body = { x: 16, y: 10, w: 16, h: 16, vx: 0, vy: 10 };
  moveAndCollide(body, solidAt);
  // Floor top edge is ty=2 -> y = 2*16 - h = 16.
  assert.equal(body.y, 16);
  assert.equal(body.x, 16);
  assert.equal(body.vy, 0, 'vy zeroed on ground contact');
  assertFlags(body, { onGround: true, onCeiling: false, onWallL: false, onWallR: false });
});

test('AC-1b: onCeiling — rising body clamps to the ceiling bottom edge; only onCeiling is true', () => {
  const solidAt = gridFrom([
    '####',
    '....',
    '....',
  ]);
  const body = { x: 16, y: 20, w: 16, h: 16, vx: 0, vy: -10 };
  moveAndCollide(body, solidAt);
  // Ceiling row ty=0, bottom edge at (0+1)*16 = 16.
  assert.equal(body.y, 16);
  assert.equal(body.vy, 0, 'vy zeroed on ceiling contact');
  assertFlags(body, { onGround: false, onCeiling: true, onWallL: false, onWallR: false });
});

test('AC-1b: onWallR — body moving right clamps to the wall left face; only onWallR is true', () => {
  const solidAt = gridFrom(['..#']);
  const body = { x: 10, y: 0, w: 16, h: 16, vx: 10, vy: 0 };
  moveAndCollide(body, solidAt);
  // Wall at tx=2, left face at 2*16 = 32 -> x = 32 - w = 16.
  assert.equal(body.x, 16);
  assert.equal(body.y, 0);
  assert.equal(body.vx, 0, 'vx zeroed on wall contact');
  assertFlags(body, { onGround: false, onCeiling: false, onWallL: false, onWallR: true });
});

test('AC-1b: onWallL — body moving left clamps to the wall right face; only onWallL is true', () => {
  const solidAt = gridFrom(['#..']);
  const body = { x: 22, y: 0, w: 16, h: 16, vx: -10, vy: 0 };
  moveAndCollide(body, solidAt);
  // Wall at tx=0, right face at (0+1)*16 = 16.
  assert.equal(body.x, 16);
  assert.equal(body.vx, 0, 'vx zeroed on wall contact');
  assertFlags(body, { onGround: false, onCeiling: false, onWallL: true, onWallR: false });
});

test('AC-1b: free space — body moves by exactly (vx, vy) and all four flags are false', () => {
  const solidAt = () => false;
  const body = { x: 0, y: 0, w: 16, h: 16, vx: 5, vy: 7 };
  moveAndCollide(body, solidAt);
  assert.equal(body.x, 5);
  assert.equal(body.y, 7);
  assert.equal(body.vx, 5, 'vx untouched without contact');
  assert.equal(body.vy, 7, 'vy untouched without contact');
  assertFlags(body, { onGround: false, onCeiling: false, onWallL: false, onWallR: false });
});

test('AC-1b: flags are recomputed each call — a contact-free call clears a previous onGround', () => {
  const solidAt = gridFrom([
    '....',
    '....',
    '####',
  ]);
  const body = { x: 16, y: 10, w: 16, h: 16, vx: 0, vy: 10 };
  moveAndCollide(body, solidAt);
  assert.equal(body.onGround, true, 'precondition: landed');
  body.vy = -5; // move up into free space
  moveAndCollide(body, solidAt);
  assert.equal(body.y, 11);
  assertFlags(body, { onGround: false, onCeiling: false, onWallL: false, onWallR: false });
});

// ---------------------------------------------------------------------------
// AC-1c: X axis resolved fully BEFORE Y — exact resting coordinates.
// ---------------------------------------------------------------------------

test('AC-1c: order-sensitive corner — vx=16/vy=16 body vs lone solid tile at (1,1) rests at exactly (16, 0)', () => {
  // Lone solid tile (1,1): pixels [16,32) x [16,32). Body 16x16 at (0,0)
  // with vx=16, vy=16.
  //   X first: at y=0 the body only occupies row ty=0, so the full X move
  //     lands at x=16 with NO wall contact. Then Y from (16,0) is blocked
  //     immediately by tile (1,1) -> y clamps to 1*16 - 16 = 0, onGround.
  //     Final (16, 0).
  //   A Y-first implementation instead falls to y=16, then X is blocked at
  //     the tile's left face -> final (0, 16) with onWallR. WRONG.
  const solidAt = (tx, ty) => tx === 1 && ty === 1;
  const body = { x: 0, y: 0, w: 16, h: 16, vx: 16, vy: 16 };
  moveAndCollide(body, solidAt);
  assert.equal(body.x, 16, 'X resolved fully before Y');
  assert.equal(body.y, 0, 'Y blocked at the tile top edge after the X move');
  assert.equal(body.vy, 0, 'vy zeroed on ground contact');
  assertFlags(body, { onGround: true, onCeiling: false, onWallL: false, onWallR: false });
});

// ---------------------------------------------------------------------------
// AC-1d: no tunnelling — |v| >= TILE is sub-stepped.
// ---------------------------------------------------------------------------

test('AC-1d: vx=48 rightward into a 1-tile-thick wall stops exactly at the wall face (wallTx*16 - w)', () => {
  // Wall is the single tile (2,0): pixels [32,48). Body w=12 at x=0; the
  // naive teleport target x=48 puts the body at [48,60) — fully PAST the
  // wall, i.e. tunnelled. Sub-stepping must stop it at x = 2*16 - 12 = 20.
  const solidAt = (tx, ty) => tx === 2 && ty === 0;
  const body = { x: 0, y: 0, w: 12, h: 14, vx: 48, vy: 0 };
  moveAndCollide(body, solidAt);
  assert.equal(body.x, 20, 'clamped at the wall left face, not tunnelled');
  assert.equal(body.vx, 0);
  assertFlags(body, { onGround: false, onCeiling: false, onWallL: false, onWallR: true });
});

test('AC-1d mirrored: vx=-48 leftward into a 1-tile-thick wall stops exactly at (wallTx+1)*16', () => {
  // Wall is the single tile (1,0): pixels [16,32). Body w=12 at x=48; the
  // naive teleport target x=0 puts the body at [0,12) — fully past the wall.
  // Sub-stepping must stop it at x = (1+1)*16 = 32.
  const solidAt = (tx, ty) => tx === 1 && ty === 0;
  const body = { x: 48, y: 0, w: 12, h: 14, vx: -48, vy: 0 };
  moveAndCollide(body, solidAt);
  assert.equal(body.x, 32, 'clamped at the wall right face, not tunnelled');
  assert.equal(body.vx, 0);
  assertFlags(body, { onGround: false, onCeiling: false, onWallL: true, onWallR: false });
});

test('AC-1d vertical: vy=48 cannot pass a 1-tile-thick floor — rests at exactly floorTy*16 - h', () => {
  // Floor is the whole row ty=2: pixels y in [32,48). Body h=14 at y=0; the
  // naive teleport target y=48 puts the body at [48,62) — below the floor.
  // Sub-stepping must stop it at y = 2*16 - 14 = 18.
  const solidAt = (tx, ty) => ty === 2;
  const body = { x: 0, y: 0, w: 12, h: 14, vx: 0, vy: 48 };
  moveAndCollide(body, solidAt);
  assert.equal(body.y, 18, 'clamped on the floor top edge, not tunnelled');
  assert.equal(body.vy, 0);
  assertFlags(body, { onGround: true, onCeiling: false, onWallL: false, onWallR: false });
});
