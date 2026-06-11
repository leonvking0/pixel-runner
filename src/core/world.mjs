import { TILE, applyGravity } from './physics.mjs';
import { moveAndCollide } from './collision.mjs';
import { parseLevel } from './level.mjs';
import { createRobo, applyHeroInput } from '../characters/robo.mjs';

// step order: input -> gravity -> move/collide -> win-check-after-integration
export function createWorld(rows) {
  const level = parseLevel(rows);
  const hero = createRobo(level.spawn.tx * TILE, level.spawn.ty * TILE);
  return { level, hero, won: false, frame: 0 };
}

export function step(world, input) {
  const inp = input || { left: false, right: false, jump: false, fire: false, slide: false };
  applyHeroInput(world.hero, inp);
  applyGravity(world.hero);
  moveAndCollide(world.hero, world.level.solidAt);
  world.frame += 1;
  const g = world.level.goal;
  if (g && !world.won) {
    const gx = g.tx * TILE, gy = g.ty * TILE;
    const h = world.hero;
    if (h.x < gx + TILE && h.x + h.w > gx && h.y < gy + TILE && h.y + h.h > gy) {
      world.won = true;
    }
  }
  return world;
}
