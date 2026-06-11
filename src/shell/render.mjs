import { TILE } from '../core/physics.mjs';
import { HERO_HP } from '../core/world.mjs';
import { CHARGE_FRAMES } from '../characters/robo.mjs';

export function render(ctx, world, hud) {
	ctx.setTransform(2, 0, 0, 2, 0, 0);
	ctx.fillStyle = '#0d0d1a';
	ctx.fillRect(0, 0, world.level.width * TILE, world.level.height * TILE);

	for (let ty = 0; ty < world.level.height; ty++) {
		const row = world.level.rows[ty];
		for (let tx = 0; tx < row.length; tx++) {
			const ch = row[tx];
			if (ch === '#') {
				ctx.fillStyle = '#3a4a5a';
				ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
				ctx.fillStyle = '#55708a';
				ctx.fillRect(tx * TILE, ty * TILE, TILE, 2);
			} else if (ch === 'G') {
				ctx.fillStyle = '#ffd54f';
				ctx.fillRect(tx * TILE + 4, ty * TILE + 2, 8, 14);
			}
		}
	}

	for (const e of world.enemies) {
		if (e.defeated) {
			ctx.fillStyle = '#555';
			ctx.fillRect(e.x, e.y + e.h - 4, e.w, 4);
		} else {
			ctx.fillStyle = '#e05548';
			ctx.fillRect(e.x, e.y, e.w, e.h);
			ctx.fillStyle = '#fff';
			ctx.fillRect(e.x + 3, e.y + 4, 2, 2);
			ctx.fillRect(e.x + e.w - 5, e.y + 4, 2, 2);
		}
	}

	for (const p of world.projectiles) {
		ctx.fillStyle = p.dmg > 1 ? '#80e0ff' : '#fff';
		ctx.fillRect(p.x, p.y, p.w, p.h);
	}

	const h = world.hero;
	if (h.invulnFrames > 0 && (h.invulnFrames % 4 < 2)) {
		// skip body draw — blink
	} else {
		ctx.fillStyle = '#4fc3f7';
		ctx.fillRect(h.x, h.y, h.w, h.h);
		ctx.fillStyle = '#fff';
		ctx.fillRect(h.facing > 0 ? h.x + h.w - 4 : h.x + 2, h.y + 3, 2, 2);
	}

	const hp = Math.max(0, world.hero.hp);
	hud.health.textContent = 'HP ' + hp + '/' + HERO_HP;
	const ratio = Math.min(world.hero.fireHeld / CHARGE_FRAMES, 1);
	hud.charge.style.width = Math.round(ratio * 100) + '%';
	hud.status.textContent = world.won ? 'YOU WIN' : (world.lost ? 'GAME OVER' : '');
}
