// test/registry.test.mjs — AC-3 acceptance tests (M2: pluggable character registry).
//
// CONTRACT this file pins for the registry public surface (the implementation
// MUST provide exactly this API):
//
//   // src/core/registry.mjs
//   //   registerCharacter(id, factory)
//   //     - id: non-empty string; factory: function. Anything else ⇒ throws
//   //       TypeError (synchronously, registering nothing).
//   //     - Re-registering an existing id OVERWRITES the previous factory.
//   //   createCharacter(id, ...args)
//   //     - Unknown (never-registered) id ⇒ throws an Error whose message
//   //       contains the offending id (diagnosable failure).
//   //     - Known id ⇒ returns factory(...args): positional args are forwarded
//   //       verbatim, and each call invokes the factory again (a FRESH instance
//   //       per call — never a cached/shared object).
//
// PLUGGABILITY PROOF (SPEC AC-3): this file imports ONLY src/core/registry.mjs
// (plus node:test / node:assert). The synthetic character below ("Gear Golem",
// an original name) is defined INLINE in this test. If these tests pass, a new
// character was registered and spawned without editing any src/core/* file —
// the passing run itself is the proof. Do NOT add imports of world/physics/
// collision/level/characters to this file.
//
// FREEZE RULES (SPEC D10): all assertions are exact values; this file freezes
// at M2's first commit (oracle-integrity).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { registerCharacter, createCharacter } from '../src/core/registry.mjs';

// Synthetic character factory, defined inline — original name "Gear Golem".
function createGearGolem(x, y) {
  return { x, y, w: 10, h: 10, vx: 0, vy: 0, name: 'Gear Golem' };
}

test('AC-3: registry exports — registerCharacter and createCharacter are functions', () => {
  assert.equal(typeof registerCharacter, 'function');
  assert.equal(typeof createCharacter, 'function');
});

test('AC-3: register + spawn a synthetic character via the public API only — positional args are forwarded verbatim', () => {
  registerCharacter('gear-golem', createGearGolem);
  const g = createCharacter('gear-golem', 48, 32);
  assert.equal(g.x, 48, 'first positional arg forwarded to the factory');
  assert.equal(g.y, 32, 'second positional arg forwarded to the factory');
  assert.equal(g.w, 10);
  assert.equal(g.h, 10);
  assert.equal(g.vx, 0);
  assert.equal(g.vy, 0);
  assert.equal(g.name, 'Gear Golem', 'synthetic character name (ORIGINAL ONLY)');
});

test('AC-3: createCharacter forwards an arbitrary arg list verbatim (variadic, order preserved)', () => {
  registerCharacter('arg-echo', (...args) => ({ args }));
  const e = createCharacter('arg-echo', 1, 'two', 3);
  assert.deepEqual(e.args, [1, 'two', 3]);
  const none = createCharacter('arg-echo');
  assert.deepEqual(none.args, [], 'zero extra args ⇒ factory called with zero args');
});

test('AC-3: each createCharacter call returns a FRESH instance — distinct objects, no shared state', () => {
  registerCharacter('gear-golem', createGearGolem);
  const a = createCharacter('gear-golem', 0, 0);
  const b = createCharacter('gear-golem', 0, 0);
  assert.notEqual(a, b, 'two calls must not return the same object');
  a.x = 999;
  assert.equal(b.x, 0, 'mutating one instance must not affect another');
});

test('AC-3: createCharacter on an unknown id throws, and the message names the offending id', () => {
  assert.throws(
    () => createCharacter('never-registered-id'),
    (err) => err instanceof Error && err.message.includes('never-registered-id'),
    'unknown id must throw an Error mentioning the id',
  );
});

test('AC-3: bad registration args throw TypeError and register nothing', () => {
  assert.throws(() => registerCharacter(42, createGearGolem), TypeError, 'non-string id');
  assert.throws(() => registerCharacter('', createGearGolem), TypeError, 'empty-string id');
  assert.throws(() => registerCharacter('bad-factory', null), TypeError, 'null factory');
  assert.throws(() => registerCharacter('bad-factory', 'not-a-fn'), TypeError, 'non-function factory');
  // The failed registrations above must not have created a usable entry.
  assert.throws(() => createCharacter('bad-factory'), Error, 'a TypeError-rejected registration must not register');
});

test('AC-3: re-registering an id OVERWRITES the previous factory', () => {
  registerCharacter('gear-golem', createGearGolem);
  assert.equal(createCharacter('gear-golem', 0, 0).name, 'Gear Golem', 'original factory is live before re-registration');
  registerCharacter('gear-golem', () => ({ mark: 2 }));
  const replaced = createCharacter('gear-golem');
  assert.equal(replaced.mark, 2, 're-registration replaces the factory');
  assert.equal(replaced.name, undefined, 'old factory shape is gone after overwrite');
});
