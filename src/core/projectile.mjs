// src/core/projectile.mjs — projectile entity (SPEC AC-3): vx = facing*PROJ_VX, removed on solid-tile hit. No gravity; flies straight.
import { overlapsSolid } from './collision.mjs';

export const PROJ_VX = 6;
export const PROJ_DMG = 1;
export const PROJ_W = 4;
export const PROJ_H = 2;

export function createProjectile(x, y, facing, dmg = PROJ_DMG) {
    return {
        x,
        y,
        w: PROJ_W,
        h: PROJ_H,
        vx: facing * PROJ_VX,
        vy: 0,
        dmg,
        removed: false
    };
}

export function stepProjectile(p, solidAt) {
    if (p.removed) return p;
    p.x += p.vx;
    if (overlapsSolid(p.x, p.y, p.w, p.h, solidAt)) {
        p.removed = true;
    }
    return p;
}
