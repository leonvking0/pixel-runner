import { createWorld, step } from '../core/world.mjs';
import { DEMO_LEVEL } from '../levels/demo.mjs';
import { createInput } from './input.mjs';
import { render } from './render.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = { health: document.getElementById('hud-health'), charge: document.getElementById('hud-charge'), status: document.getElementById('status') };

const world = createWorld(DEMO_LEVEL);
const input = createInput(window);

const STEP_MS = 1000 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250;
  while (acc >= STEP_MS) {
    if (!world.won && !world.lost) step(world, input.sample());
    acc -= STEP_MS;
  }
  render(ctx, world, hud);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
