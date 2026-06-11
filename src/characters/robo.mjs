// Rivet — original hero entity. This module only sets velocities from input;
// the world module owns gravity, integration, and collision.
import { createBody } from '../core/physics.mjs';
import { registerCharacter } from '../core/registry.mjs';
import { createProjectile, PROJ_DMG, PROJ_W, PROJ_H } from '../core/projectile.mjs';

export const MOVE_VX = 2;
export const JUMP_VY = -10;
export const HERO_W = 12;
export const HERO_H = 14;
export const HERO_NAME = 'Rivet';
export const SLIDE_H = 8;
export const SLIDE_VX = 4;
export const SLIDE_FRAMES = 20;
export const CHARGE_FRAMES = 30;
export const CHARGED_DMG = 3;

export function createRobo(x, y) {
  const body = createBody(x, y, HERO_W, HERO_H);
  body.name = HERO_NAME;
  body.facing = 1;
  body.fireHeld = 0;
  body.firePrev = false;
  body.slideFrames = 0;
  body.applyInput = (input, world) => applyHeroInput(body, input, world);
  return body;
}

export function applyHeroInput(hero, input, world) {
  // (1) Fire machine — runs every frame, including during slide.
  if (!input.fire && hero.firePrev) {
    const dmg = hero.fireHeld >= CHARGE_FRAMES ? CHARGED_DMG : PROJ_DMG;
    if (world && Array.isArray(world.projectiles)) {
      const px = hero.facing > 0 ? hero.x + hero.w : hero.x - PROJ_W;
      const py = hero.y + Math.floor(hero.h / 2) - Math.floor(PROJ_H / 2);
      world.projectiles.push(createProjectile(px, py, hero.facing, dmg));
    }
    hero.fireHeld = 0;
  }
  if (input.fire) hero.fireHeld += 1;
  hero.firePrev = input.fire;

  // (2) Slide restore — bottom edge stays fixed.
  if (hero.slideFrames === 0 && hero.h === SLIDE_H) {
    hero.h = HERO_H;
    hero.y -= (HERO_H - SLIDE_H);
  }

  // (3) Movement.
  if (hero.slideFrames > 0) {
    hero.vx = hero.facing * SLIDE_VX;
    hero.slideFrames -= 1;
    return hero;
  }
  hero.vx = 0;
  if (input.left) {
    hero.vx -= MOVE_VX;
    hero.facing = -1;
  }
  if (input.right) {
    hero.vx += MOVE_VX;
    hero.facing = 1;
  }
  if (input.jump && hero.onGround) hero.vy = JUMP_VY;
  if (input.slide && hero.onGround) {
    hero.slideFrames = SLIDE_FRAMES - 1; // start frame counts as slide frame #1
    hero.h = SLIDE_H;
    hero.y += HERO_H - SLIDE_H;
    hero.vx = hero.facing * SLIDE_VX;
  }
  return hero;
}

registerCharacter('robo', (x, y) => createRobo(x, y));
