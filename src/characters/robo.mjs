// Rivet — original hero entity. This module only sets velocities from input;
// the world module owns gravity, integration, and collision.
import { createBody } from '../core/physics.mjs';

export const MOVE_VX = 2;
export const JUMP_VY = -10;
export const HERO_W = 12;
export const HERO_H = 14;
export const HERO_NAME = 'Rivet';

export function createRobo(x, y) {
  const body = createBody(x, y, HERO_W, HERO_H);
  body.name = HERO_NAME;
  return body;
}

export function applyHeroInput(hero, input) {
  hero.vx = 0;
  if (input.left) hero.vx -= MOVE_VX;
  if (input.right) hero.vx += MOVE_VX;
  if (input.jump && hero.onGround) hero.vy = JUMP_VY;
  return hero;
}
