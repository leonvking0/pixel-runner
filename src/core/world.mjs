import { TILE, applyGravity } from './physics.mjs';
import { moveAndCollide } from './collision.mjs';
import { parseLevel } from './level.mjs';
import { createCharacter } from './registry.mjs';
import { stepProjectile } from './projectile.mjs';
import '../characters/robo.mjs';

// step order: input -> gravity -> move/collide -> win-check-after-integration
export function createWorld(rows) {
  const level = parseLevel(rows);
  const hero = createCharacter('robo', level.spawn.tx * TILE, level.spawn.ty * TILE);
  return { level, hero, projectiles: [], won: false, frame: 0 };
}

export function step(world, input) {
  const inp = input || { left: false, right: false, jump: false, fire: false, slide: false };
  world.hero.applyInput(inp, world);
  applyGravity(world.hero);
  moveAndCollide(world.hero, world.level.solidAt);
  for (const p of world.projectiles) stepProjectile(p, world.level.solidAt);
  world.projectiles = world.projectiles.filter((p) => !p.removed);
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
