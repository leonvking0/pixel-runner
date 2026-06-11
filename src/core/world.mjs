import { TILE, applyGravity } from './physics.mjs';
import { moveAndCollide } from './collision.mjs';
import { parseLevel } from './level.mjs';
import { createCharacter } from './registry.mjs';
import { stepProjectile } from './projectile.mjs';
import { createEnemy, stepEnemy } from './enemy.mjs';
import '../characters/robo.mjs';

export const STOMP_BOUNCE_VY = -8;
export const INVULN_FRAMES = 30;
export const KNOCKBACK_VX = 2;
export const HERO_HP = 3;

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// step order: input -> gravity -> move/collide -> enemies -> projectiles -> combat -> win-check
export function createWorld(rows) {
  const level = parseLevel(rows);
  const hero = createCharacter('robo', level.spawn.tx * TILE, level.spawn.ty * TILE);
  hero.hp = HERO_HP;
  hero.invulnFrames = 0;
  hero.knockbackDir = 0;
  const enemies = level.enemies.map(({ tx, ty }) => createEnemy(tx, ty));
  return { level, hero, enemies, projectiles: [], won: false, lost: false, frame: 0 };
}

export function step(world, input) {
  const inp = input || { left: false, right: false, jump: false, fire: false, slide: false };
  const hero = world.hero;
  const prevBottom = hero.y + hero.h;
  const wasInvuln = hero.invulnFrames > 0;
  if (wasInvuln) {
    hero.applyInput({ ...inp, left: false, right: false }, world);
    hero.vx = hero.knockbackDir * KNOCKBACK_VX;
  } else {
    hero.applyInput(inp, world);
  }
  applyGravity(hero);
  moveAndCollide(hero, world.level.solidAt);
  for (const e of world.enemies) {
    if (!e.defeated) stepEnemy(e, world.level.solidAt);
  }
  for (const p of world.projectiles) stepProjectile(p, world.level.solidAt);
  for (const p of world.projectiles) {
    if (p.removed) continue;
    for (const e of world.enemies) {
      if (e.defeated) continue;
      if (aabbOverlap(p, e)) {
        e.defeated = true;
        p.removed = true;
        break;
      }
    }
  }
  world.projectiles = world.projectiles.filter((p) => !p.removed);
  for (const e of world.enemies) {
    if (e.defeated || !aabbOverlap(hero, e)) continue;
    if (hero.vy > 0 && prevBottom <= e.y) {
      e.defeated = true;
      hero.vy = STOMP_BOUNCE_VY;
    } else if (hero.invulnFrames === 0) {
      hero.hp -= 1;
      hero.invulnFrames = INVULN_FRAMES;
      hero.knockbackDir = (hero.x + hero.w / 2 < e.x + e.w / 2) ? -1 : 1;
      hero.vx = hero.knockbackDir * KNOCKBACK_VX;
      if (hero.hp <= 0) world.lost = true;
    }
  }
  if (wasInvuln) hero.invulnFrames -= 1;
  world.frame += 1;
  const g = world.level.goal;
  if (g && !world.won && !world.lost) {
    const gx = g.tx * TILE, gy = g.ty * TILE;
    const h = world.hero;
    if (h.x < gx + TILE && h.x + h.w > gx && h.y < gy + TILE && h.y + h.h > gy) {
      world.won = true;
    }
  }
  return world;
}
