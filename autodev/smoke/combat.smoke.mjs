// combat smoke (AC-4) — proves the committed WIN_INPUTS defeats the corridor-blocking enemy en route to the goal; note that the EXPECTED_ENEMIES_DEFEATED line is the sed-inversion target.
import { createWorld, step } from '../../src/core/world.mjs';
import { DEMO_LEVEL, WIN_INPUTS } from '../../src/levels/demo.mjs';

const MAX_STEPS = 2000;
const EXPECTED_ENEMIES_DEFEATED = 1;
const NO_INPUT = { left: false, right: false, jump: false, fire: false, slide: false };
const world = createWorld(DEMO_LEVEL);

const enemyCount = world.enemies.length;
if (enemyCount < 1) {
  console.error("SMOKE FAIL: zero E tiles parsed (enemyCount=" + enemyCount + ")");
  process.exit(1);
}

for (let s = 1; s <= MAX_STEPS; s++) {
  step(world, WIN_INPUTS[s - 1] ?? NO_INPUT);
  if (world.lost === true) {
    console.error("SMOKE FAIL: lost at step " + s);
    process.exit(1);
  }
  if (world.won === true) {
    const defeated = world.enemies.filter((e) => e.defeated).length;
    if (defeated < 1 || defeated !== EXPECTED_ENEMIES_DEFEATED) {
      console.error("SMOKE FAIL: won at step " + s + " but enemiesDefeated=" + defeated + " (expected " + EXPECTED_ENEMIES_DEFEATED + ")");
      process.exit(1);
    }
    console.log("SMOKE OK: won at step " + s + " with " + defeated + "/" + enemyCount + " enemies defeated");
    process.exit(0);
  }
}

console.error("SMOKE FAIL: won !== true after " + MAX_STEPS + " steps");
process.exit(1);
