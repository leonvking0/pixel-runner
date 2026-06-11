// collision.mjs — deterministic AABB tile-collision core.
// Resolution order: X axis fully resolved before Y axis.
// Right/bottom edges are EXCLUSIVE: tile-range math uses (x + w - 1) and (y + h - 1).

import { TILE } from './physics.mjs';

export function overlapsSolid(x, y, w, h, solidAt) {
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.floor((x + w - 1) / TILE);
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.floor((y + h - 1) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (solidAt(tx, ty)) return true;
    }
  }
  return false;
}

export function moveAndCollide(body, solidAt) {
  body.onGround = false;
  body.onCeiling = false;
  body.onWallL = false;
  body.onWallR = false;

  const sx = Math.sign(body.vx);
  for (let i = Math.abs(body.vx); i > 0; i--) {
    if (overlapsSolid(body.x + sx, body.y, body.w, body.h, solidAt)) {
      if (sx > 0) body.onWallR = true;
      else body.onWallL = true;
      body.vx = 0;
      break;
    }
    body.x += sx;
  }

  const sy = Math.sign(body.vy);
  for (let i = Math.abs(body.vy); i > 0; i--) {
    if (overlapsSolid(body.x, body.y + sy, body.w, body.h, solidAt)) {
      if (sy > 0) body.onGround = true;
      else body.onCeiling = true;
      body.vy = 0;
      break;
    }
    body.y += sy;
  }

  return body;
}
