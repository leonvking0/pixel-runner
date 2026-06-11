# SPEC — pixel-runner   (v1)
Owned by /autodev-plan. FROZEN mid-run: contradiction ⇒ BLOCKED: spec-drift; revise only via /autodev-plan replan.

## Product
An original 2D side-scrolling platformer playable in a web browser, with zero npm dependencies
(HTML5 canvas + ES modules). The engine is a deterministic fixed-timestep core (physics, AABB
tile collision, world stepping, combat) with a thin canvas render/input shell on top. The first
playable character is an original armored-robot hero ("Rivet", character id `robo`) with tight
run/jump platforming plus a ranged kit: an arm-cannon projectile, a charge shot, and a slide.
Characters and abilities are added through a pluggable registry with swappable asset packs, so
more characters (and real art) can be added later without touching the core.

## Acceptance criteria
Every criterion is machine-checkable; the named constants are pinned in `## Decisions` and tests
assert EXACT integer values.

- **AC-1 Deterministic physics core.** `node --test test/` passes exact-integer unit tests:
  (a) a body starting at rest under gravity has fallen exactly `K(K+1)/2` px after K steps for
  K ≤ 16 (vy sequence 1,2,…,K — semi-implicit Euler: `vy += GRAVITY` THEN `y += vy`), and vy is
  clamped at `TERMINAL_VY=16` thereafter (after 20 steps: 136 + 4·16 = 200 px);
  (b) contact flags `onGround` / `onCeiling` / `onWallL` / `onWallR` are each asserted true in a
  dedicated scenario and false otherwise;
  (c) collision resolves X before Y and clamps position to the contacted tile edge (exact resting
  coordinates asserted);
  (d) no tunnelling: a body moving with `|v| ≥ TILE` (e.g. vx = 48) toward a 1-tile-thick wall
  stops clamped at the wall face — movement is sub-stepped.
- **AC-2 Headless winnable demo level.** A level parses from a text map (`#` solid, `.` empty,
  `S` spawn, `G` goal, `E` enemy). A committed recorded input sequence (per-frame
  `{left,right,jump,fire,slide}` booleans) drives the hero from spawn to the goal tile in a
  headless `node autodev/smoke/playthrough.smoke.mjs`, which asserts `won === true` within
  `MAX_STEPS=2000` steps and exits non-zero otherwise.
- **AC-3 Pluggable character + ability system.** Characters register via
  `registerCharacter(id, factory)` / `createCharacter(id)`; a unit test registers a synthetic
  character and spawns it WITHOUT editing any `src/core/*` file (the test itself is the proof —
  it imports the registry API only). The hero's kit has exact unit tests:
  arm-cannon — fire press spawns a projectile with `vx = facing·PROJ_VX(6)`, `dmg = PROJ_DMG(1)`;
  charge shot — fire held ≥ `CHARGE_FRAMES(30)` then released spawns `dmg = CHARGED_DMG(3)`,
  released earlier spawns dmg 1; slide — hitbox height `NORMAL_H(14) → SLIDE_H(8)` and
  `vx = facing·SLIDE_VX(4)` for exactly `SLIDE_FRAMES(20)` steps, then height restores.
- **AC-4 Enemies + combat.** A patrol enemy moves `±ENEMY_PATROL_VX(1)` px/step and reverses on
  wall contact or ledge edge (exact positions after K steps asserted). A projectile overlapping
  an enemy defeats it and consumes the projectile. A stomp (hero falling onto the enemy from
  above) defeats it and sets hero `vy = STOMP_BOUNCE_VY(-8)`. Side contact damages the hero
  (hp −1, then `INVULN_FRAMES(30)` of invulnerability); hp 0 ⇒ `lost === true`. Unit-tested,
  PLUS a combat playthrough smoke on a level where the only path to the goal is blocked by an
  enemy — winning requires defeating it.
- **AC-5 Browser-playable with verified wiring.** `python3 -m http.server` serves `index.html`;
  the serve smoke asserts the page contains a `<canvas>`, human-readable control hints (key
  names), and a `<script type="module">` entry that itself fetches with HTTP 200; AND extracts
  every id referenced by the shell JS (`getElementById('X')` / `querySelector('#X')` across
  `src/shell/*.mjs`) and asserts each is present as `id="X"` in `index.html` (JS-referenced ids
  ⊆ HTML ids). The step FAILS if extraction finds zero JS-referenced ids (vacuous-pass guard).
- **AC-6 Original assets only.** The gate asserts `git ls-files` tracks NO binary/media asset
  (`png jpg jpeg gif webp bmp ico svg wav mp3 ogg flac mid ttf otf woff woff2`). All placeholder
  art is original canvas primitives drawn in code. No third-party or copyrighted sprite, tileset,
  audio, character name, or likeness anywhere (review-enforced on top of the gate proxy).
- **AC-7 Zero-dependency deterministic gate.** No `package.json`, no `node_modules`, no npm
  install anywhere. The gate runs only `node --test`, headless `node <smoke>.mjs`, and
  `python3 -m http.server`; ≤ 10 min; localhost-only. The gate greps that `src/core/`,
  `src/characters/`, `src/levels/` contain no `Date.now`, `Math.random`, or `performance.now`.

## Non-goals
Audio/music; mobile/touch; a level editor; multiple full levels (one demo level is enough);
networking/multiplayer; save/load; real (non-placeholder) sprite art; animation polish.

## Decisions (append-only)
- D1 Layout: `src/core/` (deterministic, zero DOM/timer access), `src/characters/`,
  `src/levels/`, `src/shell/` (browser-only), `test/` (node --test), `autodev/smoke/`.
- D2 Physics: `TILE=16`, `GRAVITY=1` per step, `TERMINAL_VY=16`; semi-implicit Euler
  (`vel += accel` then `pos += vel`); integer positions/velocities only; collision resolves X
  then Y, clamped to the contacted tile edge; moves with `|v| ≥ TILE` are sub-stepped.
- D3 Gameplay constants (tests assert these exact values): `MOVE_VX=2`, `JUMP_VY=-10`,
  hero hitbox 12×14 (`NORMAL_H=14`), `SLIDE_H=8`, `SLIDE_VX=4`, `SLIDE_FRAMES=20`,
  `CHARGE_FRAMES=30`, `PROJ_VX=6`, `PROJ_DMG=1`, `CHARGED_DMG=3`, `HERO_HP=3`,
  `ENEMY_PATROL_VX=1`, `STOMP_BOUNCE_VY=-8`, `INVULN_FRAMES=30`, `MAX_STEPS=2000`.
- D4 Level text format: one string per row; `#` solid, `.` empty, `S` spawn, `G` goal,
  `E` enemy spawn. Input records: per-frame `{left,right,jump,fire,slide}` booleans.
- D5 Gate shape: `autodev/gate.sh` steps in order — `secrets` (probes/secret-leak.sh),
  `integrity` (probes/oracle-integrity.sh, FIRST after secrets), `hygiene` (AC-6 media-file ban +
  AC-7 zero-dep + determinism greps), `unit` (`node --test test/`), then one smoke step per
  milestone (`smoke-fall`, `smoke-playthrough`, `smoke-combat`, `serve`). Fail ⇒ last line
  `GATE FAIL step=<name>`, exit non-zero. Pass ⇒ write `git rev-parse HEAD` to
  `.autodev/gate-green` UNLESS `.autodev/phase` == implement.
- D6 Originality proxy: the machine-checkable floor is the AC-6 no-media-files gate step; the
  legal line (no imitative names/likenesses/pixel-art) is enforced by review landmines in every
  milestone. Hero display name "Rivet" is original to this project.
- D7 Stomp disambiguation: an overlap counts as a stomp iff hero `vy > 0` AND the hero's bottom
  edge was at or above the enemy's top edge on the previous step; otherwise it is side contact.
  Stomp is checked before side damage.

## Revision log
- v0: template seed.
- v1: full spec authored from the completed operator interview (2026-06-10).
