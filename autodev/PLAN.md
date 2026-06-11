# PLAN — pixel-runner (spec: autodev/SPEC.md)
PM writes; orchestrator ticks boxes + edits FUTURE milestones only; changelog append-only.
Format: `- [ ] M<n> — <title>` + indented `goal:` / `accept:` (runnable commands) / optional `landmines:`.

## Milestones

- [ ] M0 — Oracle: deterministic physics core + real gate.sh
  goal: Replace the placeholder gate with the real oracle and land the deterministic kernel it
    judges: `src/core/physics.mjs` (constants from SPEC D2/D3 + body integration) and
    `src/core/collision.mjs` (AABB tile collision vs a `solidAt(tx,ty)` grid; contact flags
    onGround/onCeiling/onWallL/onWallR; X-then-Y edge-clamped resolution; sub-stepped moves),
    with exact-integer unit tests (AC-1) and a headless free-fall smoke
    `autodev/smoke/fall.smoke.mjs` (drop a body in a closed box, assert the exact resting y and
    onGround===true). Files (≤6): autodev/gate.sh, src/core/physics.mjs, src/core/collision.mjs,
    test/physics.test.mjs, test/collision.test.mjs, autodev/smoke/fall.smoke.mjs.
    gate.sh steps in SPEC D5 order: secrets → integrity → hygiene → unit → smoke-fall.
  accept:
    - bash autodev/gate.sh                                  # green: all steps pass, writes .autodev/gate-green
    - node --test test/                                     # AC-1 exact-integer assertions pass standalone
    - # inversion proof (run, observe, restore):
    -   change the expected resting-y constant in autodev/smoke/fall.smoke.mjs by +1
    -   bash autodev/gate.sh; test $? -ne 0                 # MUST exit non-zero, last line "GATE FAIL step=smoke-fall"
    -   git checkout -- autodev/smoke/fall.smoke.mjs && bash autodev/gate.sh   # green again
  landmines:
    - MUST use exactly TILE=16, GRAVITY=1, TERMINAL_VY=16; semi-implicit Euler ORDER: vy += GRAVITY first, THEN y += vy.
    - MUST NOT use Date.now, Math.random, performance.now, setTimeout, or any DOM API in src/core/.
    - MUST resolve X axis fully before Y, clamping to the contacted tile edge; MUST sub-step any move with |v| >= TILE (vx=48 into a 1-tile wall stops AT the wall).
    - All positions/velocities are integers; tests assert exact values (free-fall y = K(K+1)/2), never ranges or approximations.
    - gate.sh: fail ⇒ last line `GATE FAIL step=<name>` + non-zero exit; pass ⇒ write `git rev-parse HEAD` to .autodev/gate-green UNLESS .autodev/phase == implement; ≤10 min; localhost-only; step=integrity runs FIRST after step=secrets.
    - step=hygiene MUST fail on: any tracked media file (png/jpg/jpeg/gif/webp/bmp/ico/svg/wav/mp3/ogg/flac/mid/ttf/otf/woff/woff2), any package.json or node_modules, any Date.now/Math.random/performance.now hit in src/core src/characters src/levels.
    - MUST NOT add npm/package.json or any dependency. ORIGINAL ONLY: no copyrighted names, art, or likenesses anywhere (code, comments, test data).

- [ ] M1 — Level + hero + headless winnable playthrough
  goal: Make the demo level winnable headlessly (AC-2). `src/core/level.mjs` parses the SPEC-D4
    text format (#/. /S/G/E) into a tile grid + spawn/goal/enemy positions; `src/core/world.mjs`
    owns entities and `step(inputs)` (apply per-frame input record, integrate, collide, set
    `won` when the hero AABB overlaps the goal tile); `src/characters/robo.mjs` is the hero
    entity (run MOVE_VX=2, jump JUMP_VY=-10 when onGround, hitbox 12×14 — movement only, kit
    comes in M2); `src/levels/demo.mjs` exports the level text + a recorded input sequence that
    wins. New smoke `autodev/smoke/playthrough.smoke.mjs` asserts won===true within
    MAX_STEPS=2000. Files (≤6): the four sources + test/world.test.mjs + the smoke.
    Gate growth: add step=smoke-playthrough to gate.sh (orchestrator, S3g).
  accept:
    - bash autodev/gate.sh                                  # green incl. NEW step=smoke-playthrough
    - node --test test/world.test.mjs                       # exact: spawn at S tile, MOVE_VX/JUMP_VY arithmetic, win on goal overlap, no win without input
    - node autodev/smoke/playthrough.smoke.mjs              # exits 0, prints the winning step count
  landmines:
    - Input record per frame is exactly {left,right,jump,fire,slide} booleans; the recorded winning sequence is committed PLAIN DATA (array literal), never generated at runtime.
    - MUST NOT modify M0 files except world-facing additive exports; MUST NOT touch autodev/gate.sh steps from M0; MUST NOT weaken any existing test (oracle-integrity will catch it).
    - src/core/ and src/levels/ stay DOM-free and deterministic (no Date.now/Math.random).
    - Jump only when onGround; hold-jump does not re-trigger mid-air. Win = AABB overlap with the G tile rectangle, checked AFTER integration in the same step.
    - The smoke MUST exit non-zero if won !== true by step 2000 (bounded loop, no while(true)).

- [ ] M2 — Character registry + ranged kit (arm-cannon, charge shot, slide)
  goal: The pluggable system (AC-3). `src/core/registry.mjs` exposes
    registerCharacter(id, factory) / createCharacter(id); `src/core/projectile.mjs` adds the
    projectile entity (vx=facing·PROJ_VX, dmg, removed on solid-tile hit); `src/characters/robo.mjs`
    registers id `robo` and gains the kit: fire press → projectile dmg=1; fire held ≥
    CHARGE_FRAMES=30 then released → dmg=CHARGED_DMG=3; slide → hitbox h 14→SLIDE_H=8 and
    vx=facing·SLIDE_VX=4 for SLIDE_FRAMES=20 then height restores. World/smoke switch to
    createCharacter('robo'). New files (≤6 total touched): registry.mjs, projectile.mjs,
    test/registry.test.mjs, test/abilities.test.mjs + RED edits to robo.mjs/world.mjs.
    Gate growth: the two new committed test files (run under existing step=unit).
  accept:
    - bash autodev/gate.sh                                  # green; step=unit now includes registry+abilities tests
    - node --test test/registry.test.mjs                    # registers a synthetic character via the public API only — proves zero core edits needed
    - node --test test/abilities.test.mjs                   # exact: PROJ_VX=6/dmg=1; hold 29 ⇒ dmg 1, hold 30 ⇒ dmg 3; slide h=8 & vx=±4 for exactly 20 frames
  landmines:
    - Adding a character MUST require no edit to src/core/* — the registry test imports only the registry module and a fresh factory defined inline in the test.
    - Charge state machine: counter increments while fire is HELD; the projectile spawns on RELEASE (fire was true last frame, false now); counter resets after release. Exactly CHARGE_FRAMES=30 held ⇒ charged.
    - Slide: only when onGround; ignores new slide presses until the 20 frames elapse; hitbox height change must not clip the hero into the floor (y adjusts so the bottom edge is unchanged).
    - MUST NOT rename or remove any existing export; MUST NOT edit M0/M1 test files (frozen by oracle-integrity).
    - ORIGINAL ONLY: ability/character names must not reference any existing game character.

- [ ] M3 — Enemies + combat playthrough
  goal: Combat (AC-4). `src/core/enemy.mjs`: patroller spawned from E tiles, vx=±ENEMY_PATROL_VX=1,
    reverses on wall contact or when the floor tile ahead is empty. Combat resolution in
    world.mjs (RED edit): projectile∩enemy ⇒ enemy defeated + projectile consumed; stomp per
    SPEC D7 ⇒ enemy defeated + hero vy=STOMP_BOUNCE_VY=-8; else side contact ⇒ hero hp−1 +
    INVULN_FRAMES=30; hp 0 ⇒ lost=true. Demo level v2 places an enemy blocking the only
    corridor to the goal; new recorded sequence defeats it en route. New smoke
    `autodev/smoke/combat.smoke.mjs` asserts won===true AND the blocking enemy was defeated.
    Files (≤6): enemy.mjs, test/combat.test.mjs, combat.smoke.mjs + RED edits to world.mjs,
    src/levels/demo.mjs. Gate growth: add step=smoke-combat (orchestrator, S3g).
  accept:
    - bash autodev/gate.sh                                  # green incl. NEW step=smoke-combat
    - node --test test/combat.test.mjs                      # exact patrol positions after K steps incl. both reversal causes; stomp bounce vy=-8; projectile kill; side damage + i-frames; hp 0 ⇒ lost
    - node autodev/smoke/combat.smoke.mjs                   # exits 0; asserts enemy defeated AND won===true
  landmines:
    - Stomp rule is SPEC D7 EXACTLY: hero vy > 0 AND hero's previous-step bottom edge <= enemy top edge; stomp is evaluated BEFORE side damage; a stomp never costs hp.
    - Patrol must be a pure function of the grid + step count (exact positions assertable); ledge check = the tile below-and-ahead is non-solid.
    - During INVULN_FRAMES the hero takes no side damage but CAN still stomp and shoot.
    - The level v2 corridor MUST be physically impassable without defeating the enemy (too low to jump over: ceiling height < jump apex).
    - MUST NOT weaken or edit M0–M2 tests/smokes; combat smoke is NEW.

- [ ] M4 — Browser shell: canvas render, keyboard input, HUD (wiring-gated)
  goal: Browser playability (AC-5). `index.html` (canvas, control-hints block, HUD elements,
    `<script type="module" src="src/shell/main.mjs">`); `src/shell/main.mjs` (fixed-timestep
    loop driving core world via requestAnimationFrame + accumulator), `src/shell/input.mjs`
    (keydown/keyup → the {left,right,jump,fire,slide} record), `src/shell/render.mjs` (tiles,
    hero, enemies, projectiles as ORIGINAL canvas primitives; HUD: health + charge meter).
    New smoke `autodev/smoke/serve.smoke.mjs`: spawn `python3 -m http.server <port>`, fetch
    /index.html (assert <canvas, control hints, module entry), fetch the module entry (HTTP 200),
    extract every getElementById('X')/querySelector('#X') id from src/shell/*.mjs and assert each
    appears as id="X" in index.html (JS ids ⊆ HTML ids; FAIL if zero ids extracted), kill server.
    Files (≤6): index.html, main.mjs, input.mjs, render.mjs, serve.smoke.mjs.
    Gate growth: add step=serve (orchestrator, S3g).
  accept:
    - bash autodev/gate.sh                                  # green incl. NEW step=serve
    - node autodev/smoke/serve.smoke.mjs                    # exits 0: page assertions + id-linkage subset check pass
    - python3 -m http.server 8000 --directory . &  curl -s localhost:8000/index.html | grep -q '<canvas'; kill %1   # manual spot-check form
  landmines:
    - The serve smoke MUST gate the WIRING: JS-referenced ids ⊆ HTML ids, and MUST fail if it extracts zero JS-referenced ids (vacuous-pass guard). Existence-only id checks are NOT acceptance.
    - The shell NEVER duplicates physics: it only builds input records and calls world.step + reads state for drawing. src/core/* stays DOM-free.
    - All art = canvas primitives (fillRect/strokeRect/paths) drawn in code. MUST NOT add any image/audio/font file, base64 data-URI asset, or external URL. ORIGINAL ONLY — no imitative pixel art, no existing-game names in UI text.
    - Control hints in index.html MUST name the actual keys the input map binds (keep them in sync; the smoke greps for the key names).
    - The smoke must be bounded: poll the server with retries + a hard timeout, always kill the python process (trap), no network beyond localhost.

## Backlog (review nice-to-haves + parked ideas; triaged every plan-refresh)
- M5 (parked) — Second pluggable character + asset-pack loader: register a second original
  character (different stats/kit) purely through the registry, and a swappable draw-pack
  interface (entity → draw calls) selectable at world creation — proves AC-3 extensibility
  end-to-end with zero core edits. Gate: registry test for the second character + a serve/smoke
  assertion that the pack switch renders.

## Plan changelog (append-only)
- (bootstrap)
- 2026-06-10: v1 plan authored — M0 oracle (physics core + real gate), M1 headless winnable
  level, M2 registry + ranged kit, M3 enemies/combat, M4 browser shell with wiring-gated serve
  smoke; backlog seeds M5 second-character/asset-pack proof.
