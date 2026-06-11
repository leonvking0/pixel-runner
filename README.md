# pixel-runner

An **original** 2D side-scrolling platformer you can play in the browser — zero npm, HTML5
canvas + ES modules.

The first playable character is an original armored-robot hero with tight run/jump platforming
plus a ranged kit: an arm-cannon projectile, a charge shot, and a slide. The engine is built
around a **pluggable character + ability system** with **swappable asset packs**, so new
characters (and your own art) can be added later without touching the core.

## Scope & principles

- **All art and characters are original.** No third-party or copyrighted sprites, tilesets,
  audio, names, or likenesses — placeholder art is simple original programmer-art, and the
  asset layer is swappable so licensed/original packs can be dropped in later.
- **Mechanics, not assets.** Platformer physics and ability mechanics (jump, gravity,
  collision, projectiles, charge, slide) are original implementations.
- **Deterministic core.** Physics/collision and combat are fixed-timestep and unit-tested so
  the gate has a strong oracle; the browser layer is a thin render/input shell over it.

## Stack

Vanilla JavaScript (ES modules), HTML5 canvas, `node --test` for the headless core,
`python3 -m http.server` for the static-serve smoke. No build step, no dependencies.

> Built as the B3 dogfood target for the autodev-lite autonomous dev harness.
