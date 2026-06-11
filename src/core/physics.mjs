// Coordinate convention: x/y is the body's top-left corner in pixels. y grows DOWNWARD, so positive vy is falling.
export const TILE = 16;
export const GRAVITY = 1;
export const TERMINAL_VY = 16;

export function createBody(x, y, w, h) {
  return {
    x, y, w, h,
    vx: 0,
    vy: 0,
    onGround: false,
    onCeiling: false,
    onWallL: false,
    onWallR: false
  };
}

export function applyGravity(body) {
  body.vy = Math.min(body.vy + GRAVITY, TERMINAL_VY);
  return body;
}

export function stepBody(body) {
  applyGravity(body);
  body.x += body.vx;
  body.y += body.vy;
  return body;
}
