// test/physics.test.mjs — AC-1a acceptance tests (M0 oracle).
//
// CONTRACT this file pins for src/core/physics.mjs (the implementation MUST
// export exactly this public API):
//
//   export const TILE = 16;
//   export const GRAVITY = 1;
//   export const TERMINAL_VY = 16;
//
//   // applyGravity(body): body.vy = min(body.vy + GRAVITY, TERMINAL_VY).
//   // Mutates and returns body. Integer in, integer out.
//   export function applyGravity(body)
//
//   // stepBody(body): semi-implicit Euler, EXACTLY this order:
//   //   1) vy += GRAVITY, clamped at TERMINAL_VY   (i.e. applyGravity)
//   //   2) THEN y += vy
//   // Mutates and returns body. Integer positions/velocities only.
//   export function stepBody(body)
//
// SPEC AC-1a / D2: a body starting at rest under gravity has fallen exactly
// K(K+1)/2 px after K steps for K <= 16 (vy sequence 1,2,...,K), vy is clamped
// at TERMINAL_VY=16 thereafter; after 20 steps total fall = 136 + 4*16 = 200 px.
// All assertions are exact integers — never ranges or approximations.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TILE,
  GRAVITY,
  TERMINAL_VY,
  createBody,
  applyGravity,
  stepBody,
} from '../src/core/physics.mjs';

test('AC-1a: exported constants are exactly TILE=16, GRAVITY=1, TERMINAL_VY=16', () => {
  assert.equal(TILE, 16);
  assert.equal(GRAVITY, 1);
  assert.equal(TERMINAL_VY, 16);
});

test('AC-1a: semi-implicit Euler order — after exactly 1 step from rest, y === 1 (vy first, THEN y += vy)', () => {
  const body = { x: 0, y: 0, vx: 0, vy: 0 };
  stepBody(body);
  // Position-first (explicit Euler) order would leave y === 0 here.
  assert.equal(body.vy, 1);
  assert.equal(body.y, 1);
});

test('AC-1a: free fall from rest (createBody) — at EVERY step K <= 16, vy === K and y - y0 === K(K+1)/2; vy clamps at 16 for steps 17..20 and total fall === 200', () => {
  const y0 = 32;
  const body = createBody(48, y0, 16, 16);
  assert.equal(body.vy, 0, 'createBody starts at rest');
  for (let K = 1; K <= 16; K++) {
    stepBody(body);
    assert.equal(body.vy, K, `vy after ${K} steps`);
    assert.equal(body.y - y0, (K * (K + 1)) / 2, `total fall after ${K} steps`);
    assert.ok(Number.isInteger(body.y), `y stays an integer after ${K} steps`);
    assert.ok(Number.isInteger(body.vy), `vy stays an integer after ${K} steps`);
  }
  for (let K = 17; K <= 20; K++) {
    stepBody(body);
    assert.equal(body.vy, 16, `vy stays clamped at TERMINAL_VY on step ${K}`);
  }
  assert.equal(body.y - y0, 200, 'total fall after 20 steps = 136 + 4*16');
});

test('AC-1a: vy sequence is exactly 1,2,...,16 then clamps at TERMINAL_VY=16', () => {
  const body = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let s = 1; s <= 16; s++) {
    stepBody(body);
    assert.equal(body.vy, s, `vy on step ${s}`);
  }
  for (let s = 17; s <= 24; s++) {
    stepBody(body);
    assert.equal(body.vy, 16, `vy stays clamped at TERMINAL_VY on step ${s}`);
  }
});

test('AC-1a: after 20 steps total fall is exactly 136 + 4*16 = 200 px', () => {
  const body = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let s = 0; s < 20; s++) stepBody(body);
  assert.equal(body.y, 200);
  assert.equal(body.vy, 16);
});

test('AC-1a: applyGravity alone — vy += GRAVITY, clamped at TERMINAL_VY, x/y untouched', () => {
  const b1 = { x: 3, y: 7, vx: 0, vy: 0 };
  applyGravity(b1);
  assert.equal(b1.vy, 1);
  assert.equal(b1.x, 3, 'applyGravity must never change x');
  assert.equal(b1.y, 7, 'applyGravity must never change y');

  const b2 = { x: 0, y: 0, vx: 0, vy: 15 };
  applyGravity(b2);
  assert.equal(b2.vy, 16);

  const b3 = { x: 0, y: 0, vx: 0, vy: 16 };
  applyGravity(b3);
  assert.equal(b3.vy, 16, 'vy already at TERMINAL_VY stays clamped');
});

test('hygiene: src/core/*.mjs is deterministic — no Date.now / Math.random / performance.now / setTimeout / DOM APIs', () => {
  const banned = /Date\.now|Math\.random|performance\.now|setTimeout|window\.|document\./;
  for (const f of ['physics.mjs', 'collision.mjs']) {
    const src = readFileSync(new URL(`../src/core/${f}`, import.meta.url), 'utf8');
    assert.ok(
      !banned.test(src),
      `src/core/${f} must not use nondeterministic or DOM APIs`,
    );
  }
});
