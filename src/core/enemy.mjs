// Patrol enemy module. Reversal occurs on wall contact or empty floor tile ahead.
// Patrol position is a pure function of the grid + step count so tests can assert exact positions.
import { TILE } from './physics.mjs';
import { overlapsSolid } from './collision.mjs';

export const ENEMY_PATROL_VX = 1;
export const ENEMY_W = 16;
export const ENEMY_H = 16;

export function createEnemy(tx, ty) {
  return {
    x: tx * TILE,
    y: ty * TILE + (TILE - ENEMY_H),
    w: ENEMY_W,
    h: ENEMY_H,
    vx: -ENEMY_PATROL_VX,
    defeated: false
  };
}

export function stepEnemy(enemy, solidAt) {
  if (enemy.defeated) return enemy;

  const nx = enemy.x + enemy.vx;
  const wall = overlapsSolid(nx, enemy.y, enemy.w, enemy.h, solidAt);
  const footTx = enemy.vx > 0 ? Math.floor((nx + enemy.w - 1) / TILE) : Math.floor(nx / TILE);
  const footTy = Math.floor((enemy.y + enemy.h - 1) / TILE) + 1;
  const ledge = !solidAt(footTx, footTy);

  if (wall || ledge) {
    enemy.vx = -enemy.vx;
  } else {
    enemy.x = nx;
  }

  return enemy;
}
