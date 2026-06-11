// autodev/smoke/playthrough.smoke.mjs — M1 headless playthrough smoke (AC-2).
// Proves that the committed plain-data input sequence WIN_INPUTS actually
// completes the demo level. Emptying WIN_INPUTS (the gate's sed inversion)
// must cause this smoke to exit non-zero, confirming the inputs are required.
import { createWorld, step } from '../../src/core/world.mjs';
import { DEMO_LEVEL, WIN_INPUTS } from '../../src/levels/demo.mjs';

const MAX_STEPS = 2000;
const NO_INPUT = { left: false, right: false, jump: false, fire: false, slide: false };
const world = createWorld(DEMO_LEVEL);

for (let s = 1; s <= MAX_STEPS; s++) {
  step(world, WIN_INPUTS[s - 1] ?? NO_INPUT);
  if (world.won === true) {
    console.log("SMOKE OK: won at step " + s + " (hero x=" + world.hero.x + " y=" + world.hero.y + ")");
    process.exit(0);
  }
}

console.error("SMOKE FAIL: won !== true after " + MAX_STEPS + " steps (hero x=" + world.hero.x + " y=" + world.hero.y + ")");
process.exit(1);
