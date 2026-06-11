# PLAN — pixel-runner (spec: autodev/SPEC.md)
PM writes; orchestrator ticks boxes + edits FUTURE milestones only; changelog append-only.
Format: `- [ ] M<n> — <title>` + indented `goal:` / `accept:` (runnable commands) / optional `landmines:`.

## Cross-milestone landmines (paste into EVERY milestone's task packet)
- Test-freeze discipline (SPEC D10): every new test/*.test.mjs MUST be strong-model-authored-or-verified and `node --test test/` GREEN locally BEFORE the commit that introduces it; expected values are derived by RUNNING the implementation/sim, never hand-computed; tests freeze on first commit (oracle-integrity) — a wrong expected constant after the freeze is unrepairable and costs a full attempt.
- gate.sh is ORCHESTRATOR-authored (SPEC D9): all gate growth (new steps in autodev/gate.sh) is written by the orchestrator at S3g (phase=orchestrate, RED) — NEVER delegated to the hybrid-dev implement phase (guard rule 8 blocks gate.sh writes while .autodev/phase==implement).

## Milestones

- [x] M0 — Oracle: deterministic physics core + real gate.sh (PR #1)
  goal: Replace the placeholder gate with the real oracle and land the deterministic kernel it
    judges: `src/core/physics.mjs` (constants from SPEC D2/D3 + body integration) and
    `src/core/collision.mjs` (AABB tile collision vs a `solidAt(tx,ty)` grid; contact flags
    onGround/onCeiling/onWallL/onWallR; X-then-Y edge-clamped resolution; sub-stepped moves),
    with exact-integer unit tests (AC-1) and a headless free-fall smoke
    `autodev/smoke/fall.smoke.mjs` (drop a body in a closed box, assert the exact resting y and
    onGround===true; the expectation is declared as exactly ONE line
    `const EXPECTED_REST_Y = <n>;` — the inversion proof seds that line).
    autodev/gate.sh is ORCHESTRATOR-authored at S3g (phase=orchestrate, RED — SPEC D9), NOT in
    the hybrid-dev file list. hybrid-dev files (≤5): src/core/physics.mjs, src/core/collision.mjs,
    test/physics.test.mjs, test/collision.test.mjs, autodev/smoke/fall.smoke.mjs.
    gate.sh steps in SPEC D5 order: secrets → integrity → hygiene → unit → smoke-fall.
  accept:
    - bash autodev/gate.sh                                  # green: all steps pass, writes .autodev/gate-green
    - node --test test/                                     # AC-1 exact-integer assertions pass standalone
    - sed -i 's/^const EXPECTED_REST_Y = .*/const EXPECTED_REST_Y = 999;/' autodev/smoke/fall.smoke.mjs
    - bash autodev/gate.sh 2>&1 | tail -1 | grep -qx 'GATE FAIL step=smoke-fall'   # inversion proof: MUST match
    - git checkout -- autodev/smoke/fall.smoke.mjs && bash autodev/gate.sh         # green again
  landmines:
    - autodev/gate.sh is ORCHESTRATOR-authored (RED) at phase=orchestrate / S3g — NEVER delegated to the implement phase (guard rule 8 blocks ALL gate.sh writes while .autodev/phase==implement; delegating it deadlocks the milestone). Same rule for every later milestone's gate growth.
    - Test-freeze (SPEC D10): test/physics.test.mjs and test/collision.test.mjs MUST be strong-verified and locally GREEN (`node --test test/`) BEFORE their first commit; expected values derived by RUNNING the sim, never hand-computed — they freeze on first commit.
    - fall.smoke.mjs MUST declare its expectation as exactly one line `const EXPECTED_REST_Y = <n>;` with <n> derived by running the sim (the accept's sed targets that line).
    - MUST use exactly TILE=16, GRAVITY=1, TERMINAL_VY=16; semi-implicit Euler ORDER: vy += GRAVITY first, THEN y += vy.
    - MUST NOT use Date.now, Math.random, performance.now, setTimeout, or any DOM API in src/core/.
    - MUST resolve X axis fully before Y, clamping to the contacted tile edge; MUST sub-step any move with |v| >= TILE (vx=48 into a 1-tile wall stops AT the wall).
    - All positions/velocities are integers; tests assert exact values (free-fall y = K(K+1)/2), never ranges or approximations.
    - gate.sh: fail ⇒ last line `GATE FAIL step=<name>` + non-zero exit; pass ⇒ write `git rev-parse HEAD` to .autodev/gate-green UNLESS .autodev/phase == implement; ≤10 min; localhost-only; step=integrity runs FIRST after step=secrets.
    - step=hygiene MUST fail on: any tracked media file, any package.json or node_modules, any determinism-grep hit. It MUST tolerate not-yet-existing dirs (src/characters, src/levels are absent at M0): determinism grep is `git grep -nE 'Date\.now|Math\.random|performance\.now' -- src/core src/characters src/levels` (exits clean when a pathspec dir is absent); media ban is `git ls-files | grep -E '\.(png|jpg|jpeg|gif|webp|bmp|ico|svg|wav|mp3|ogg|flac|mid|ttf|otf|woff|woff2)$'` (a match ⇒ FAIL). MUST NOT use `grep -r ... <dir>` — a missing dir exits 2 and permanently reds the gate.
    - MUST NOT add npm/package.json or any dependency. ORIGINAL ONLY: no copyrighted names, art, or likenesses anywhere (code, comments, test data).

- [x] M1 — Level + hero + headless winnable playthrough (PR #2)
  goal: Make the demo level winnable headlessly (AC-2). `src/core/level.mjs` parses the SPEC-D4
    text format (#/. /S/G/E) into a tile grid + spawn/goal/enemy positions; `src/core/world.mjs`
    owns entities and `step(inputs)` (apply per-frame input record, integrate, collide, set
    `won` when the hero AABB overlaps the goal tile); `src/characters/robo.mjs` is the hero
    entity (run MOVE_VX=2, jump JUMP_VY=-10 when onGround, hitbox 12×14 — movement only, kit
    comes in M2); `src/levels/demo.mjs` is RED (strong-authored): exports the level text + the
    winning input sequence as exactly ONE line `export const WIN_INPUTS = [...];`, with the
    sequence DERIVED by running the headless sim iteratively — never delegated to the weak
    model. Demo v1 is trivially winnable: flat floor S→G, hold-right + at most one jump,
    ≤200 frames, compact single-line literals (fits the 600-line budget). New smoke
    `autodev/smoke/playthrough.smoke.mjs` asserts won===true within MAX_STEPS=2000.
    Files (≤6): the four sources (demo.mjs RED) + test/world.test.mjs + the smoke.
    Gate growth: add step=smoke-playthrough to gate.sh (orchestrator, S3g, RED — SPEC D9).
  accept:
    - bash autodev/gate.sh                                  # green incl. NEW step=smoke-playthrough
    - node --test test/world.test.mjs                       # exact: spawn at S tile, MOVE_VX/JUMP_VY arithmetic, win on goal overlap, no win without input
    - node autodev/smoke/playthrough.smoke.mjs              # exits 0, prints the winning step count
    - sed -i 's/^export const WIN_INPUTS = .*/export const WIN_INPUTS = [];/' src/levels/demo.mjs
    - bash autodev/gate.sh 2>&1 | tail -1 | grep -qx 'GATE FAIL step=smoke-playthrough'   # inversion proof: MUST match
    - git checkout -- src/levels/demo.mjs && bash autodev/gate.sh                          # green again
  landmines:
    - Conventions the FROZEN test/world.test.mjs asserts (pin them now — unrepairable later): spawn = hero top-left at the S-tile origin (x=tx*16, y=ty*16); let the hero settle onto the floor before the first jump; jump arithmetic per SPEC D2 order — jump sets vy=-10, and the SAME step then does vy+=1 and y+=vy, so frame-1 rise is exactly 9px and apex rise is 45px.
    - test/world.test.mjs MUST build scenarios from INLINE level-string literals and MUST NOT import src/levels/demo.mjs (demo is rewritten in M3; world.test freezes at M1's first commit).
    - Test-freeze (SPEC D10): world.test.mjs strong-verified + locally GREEN before its first commit; expected values derived by running the sim.
    - src/levels/demo.mjs is RED (strong lane authors it; the winning sequence is derived by iteratively RUNNING the headless sim). WIN_INPUTS MUST be a single line (the accept's sed targets it).
    - Input record per frame is exactly {left,right,jump,fire,slide} booleans; the recorded winning sequence is committed PLAIN DATA (array literal), never generated at runtime.
    - MUST NOT modify M0 files except world-facing additive exports; MUST NOT touch autodev/gate.sh steps from M0; MUST NOT weaken any existing test (oracle-integrity will catch it).
    - src/core/ and src/levels/ stay DOM-free and deterministic (no Date.now/Math.random).
    - Jump only when onGround; hold-jump does not re-trigger mid-air. Win = AABB overlap with the G tile rectangle, checked AFTER integration in the same step.
    - The smoke MUST exit non-zero if won !== true by step 2000 (bounded loop, no while(true)).

- [x] M2 — Character registry + ranged kit (arm-cannon, charge shot, slide) (PR #3)
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
    - world.mjs owns hero creation via the registry (createCharacter('robo')); the M1 playthrough smoke is UNCHANGED — do NOT touch a 7th file.
    - 'robo' registration MUST be reachable from the frozen M1 tests' import graph: world.mjs (or demo.mjs) imports src/characters/robo.mjs, so createCharacter('robo') resolves without editing any frozen test.
    - Exactly ONE projectile per press→release cycle: it spawns on the RELEASE frame only — never two on a charged shot.
    - Slide vx is LOCKED to facing·SLIDE_VX=4 for the FULL 20 frames — left/right input is ignored while sliding.
    - test/registry.test.mjs + test/abilities.test.mjs are STRONG-VERIFIED before first commit (highest off-by-one density: the 29-vs-30 charge boundary, the exactly-20-frame slide); Test-freeze (SPEC D10): locally GREEN before commit, expected values derived by running the sim.
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
    INVULN_FRAMES=30 + KNOCKBACK per SPEC D8 (hero vx=KNOCKBACK_VX=2 away from the enemy for
    the full INVULN_FRAMES window, left/right input ignored during it); hp 0 ⇒ lost=true.
    Demo level v2 places an enemy blocking the only corridor to the goal; new recorded
    WIN_INPUTS (single line, strong-derived) defeats it en route. New smoke
    `autodev/smoke/combat.smoke.mjs`: asserts enemyCount >= 1 at step 0 (FAIL if zero E tiles
    parsed — vacuous-pass guard), then that the blocking enemy is defeated AND won===true,
    bounded loop <= MAX_STEPS exiting non-zero on miss; its expectation is pinned as exactly
    ONE line `const EXPECTED_ENEMIES_DEFEATED = <n>;` (n >= 1).
    Files (≤6): enemy.mjs, test/combat.test.mjs, combat.smoke.mjs + RED edits to world.mjs,
    src/levels/demo.mjs. Gate growth: add step=smoke-combat (orchestrator, S3g, RED — SPEC D9).
  accept:
    - bash autodev/gate.sh                                  # green incl. NEW step=smoke-combat
    - node --test test/combat.test.mjs                      # exact patrol positions after K steps incl. both reversal causes; stomp bounce vy=-8; projectile kill; side damage + i-frames + knockback vx=±KNOCKBACK_VX for the full INVULN_FRAMES window; hp 0 ⇒ lost
    - node autodev/smoke/combat.smoke.mjs                   # exits 0; enemyCount>=1 at step 0, blocking enemy defeated AND won===true
    - sed -i 's/^const EXPECTED_ENEMIES_DEFEATED = .*/const EXPECTED_ENEMIES_DEFEATED = 999;/' autodev/smoke/combat.smoke.mjs
    - bash autodev/gate.sh 2>&1 | tail -1 | grep -qx 'GATE FAIL step=smoke-combat'   # inversion proof: MUST match (own constant — truncating WIN_INPUTS would red at smoke-playthrough instead)
    - git checkout -- autodev/smoke/combat.smoke.mjs && bash autodev/gate.sh         # green again
  landmines:
    - KNOCKBACK per SPEC D8 is what makes the corridor impassable: on side contact set hero vx = KNOCKBACK_VX=2 px/step directed AWAY from the enemy for the FULL INVULN_FRAMES=30 window, left/right input ignored during it. test/combat.test.mjs asserts the exact vx (sign and magnitude) and the exact duration.
    - Stomp rule is SPEC D7 EXACTLY: hero vy > 0 AND hero's previous-step bottom edge <= enemy top edge; stomp is evaluated BEFORE side damage; a stomp never costs hp.
    - Patrol must be a pure function of the grid + step count (exact positions assertable); ledge check = the tile below-and-ahead is non-solid.
    - During INVULN_FRAMES the hero takes no side damage but CAN still stomp and shoot.
    - The level v2 corridor MUST be physically impassable without defeating the enemy: ceiling height < jump apex (no jump-over) AND knockback repels every walk-through attempt while the enemy lives.
    - combat.smoke.mjs MUST fail if zero E tiles parse at step 0 (vacuous-pass guard); bounded loop <= MAX_STEPS=2000, no while(true); expectation pinned as one line `const EXPECTED_ENEMIES_DEFEATED = <n>;` (the accept's sed targets it).
    - demo.mjs v2 is RED (strong lane); the new WIN_INPUTS is derived by iteratively RUNNING the sim and stays a single line.
    - Test-freeze (SPEC D10): combat.test.mjs strong-verified + locally GREEN before its first commit; expected values derived by running the sim.
    - MUST NOT weaken or edit M0–M2 tests/smokes; combat smoke is NEW.

- [ ] M4 — Browser shell: canvas render, keyboard input, HUD (wiring-gated)
  goal: Browser playability (AC-5). `index.html` (canvas, control-hints block, HUD elements,
    `<script type="module" src="src/shell/main.mjs">`); `src/shell/main.mjs` (fixed-timestep
    loop driving core world via requestAnimationFrame + accumulator), `src/shell/input.mjs`
    (keydown/keyup → the {left,right,jump,fire,slide} record), `src/shell/render.mjs` (tiles,
    hero, enemies, projectiles as ORIGINAL canvas primitives; HUD: health + charge meter — if
    charge/hp aren't already readable, add ONE additive read-only export to robo.mjs or
    world.mjs as a RED edit, counted inside the ≤6 budget; HUD value correctness is
    review-enforced, not smoke-enforced).
    New smoke `autodev/smoke/serve.smoke.mjs`: spawn `python3 -m http.server <port>`, fetch
    /index.html (assert <canvas, control hints, module entry), fetch the module entry (HTTP 200),
    extract every getElementById('X')/querySelector('#X') id from src/shell/*.mjs and assert each
    appears as id="X" in index.html (JS ids ⊆ HTML ids; FAIL if zero ids extracted), extract
    every quoted key/code string compared in src/shell/input.mjs (e.g. 'ArrowLeft', 'KeyZ') and
    assert each appears verbatim in the control-hints block of index.html (FAIL if zero key
    strings extracted), kill server.
    Files (≤6): index.html, main.mjs, input.mjs, render.mjs, serve.smoke.mjs (+ at most ONE RED
    additive-export edit to robo.mjs or world.mjs as the 6th file).
    Gate growth: add step=serve (orchestrator, S3g, RED — SPEC D9).
  accept:
    - bash autodev/gate.sh                                  # green incl. NEW step=serve
    - node autodev/smoke/serve.smoke.mjs                    # exits 0: page assertions + id-linkage subset + control-hints key-sync checks pass
  landmines:
    - The serve smoke MUST gate the WIRING: JS-referenced ids ⊆ HTML ids, and MUST fail if it extracts zero JS-referenced ids (vacuous-pass guard). Existence-only id checks are NOT acceptance.
    - Control-hints sync is MECHANICAL: the smoke extracts every quoted key/code string compared in src/shell/input.mjs and asserts each appears verbatim in the control-hints block of index.html; FAIL if zero key strings extracted (vacuous-pass guard).
    - HUD charge/hp reads: if not already exposed, exactly ONE additive read-only export on robo.mjs/world.mjs (RED, within the ≤6 budget); MUST NOT rename/remove existing exports. HUD VALUE correctness is review-enforced, not smoke-enforced.
    - The shell NEVER duplicates physics: it only builds input records and calls world.step + reads state for drawing. src/core/* stays DOM-free.
    - All art = canvas primitives (fillRect/strokeRect/paths) drawn in code. MUST NOT add any image/audio/font file, base64 data-URI asset, or external URL. ORIGINAL ONLY — no imitative pixel art, no existing-game names in UI text.
    - The smoke must be bounded: poll the server with retries + a hard timeout, always kill the python process (trap), no network beyond localhost. NEVER use a fixed shared port without retry/fallback (port collisions).

## Backlog (review nice-to-haves + parked ideas; triaged every plan-refresh)
- (M0 review nice-to-have) extend the gate determinism grep with setTimeout|window\.|document\.
  for src/core+characters+levels — currently review-enforced only (SPEC AC-7 pins just the three
  clock/random terms); watch comment/string false-positive risk.
- (M0 review nice-to-have) in-script per-step watchdog (e.g. 600s timeout wrapper) in gate.sh so a
  hung unit/smoke step emits the canonical `GATE FAIL step=<name>` line instead of relying on the
  orchestrator's session-level kill (fails closed either way today).
- (M1 review nice-to-have) createWorld throws an opaque TypeError when a level string has no S
  tile (world.mjs dereferences level.spawn unguarded) — add a diagnosable error; unreachable via
  committed levels today.
- (M1 review nice-to-have) level.mjs width = map[0].length assumes rectangular rows; harmless now
  (zero width consumers; solidAt reads per-row) — fix or document when a width consumer arrives
  (likely the M4 renderer).
- (M1 review confirmed-but-out-of-budget) ignore Python tool caches (__pycache__/, .mypy_cache/,
  .ruff_cache/) in .gitignore as a standalone harness-housekeeping commit — the hunk was reverted
  from PR #2 for diff discipline; the underlying need is real (autodev/lib/gen/__pycache__/).
- (M2 review nice-to-have) ceiling-safe slide restore: robo.mjs restores h 8→14 unconditionally
  when SLIDE_FRAMES elapse; with TILE=16 a grounded restore can never embed (passages are 16px
  multiples, NORMAL_H=14 fits), but an AIRBORNE slide under a ceiling could. Delay restore until
  the expanded rect is clear of solids — becomes load-bearing only if airborne slides or
  sub-tile geometry ever exist.
- (M2 review nice-to-have) jump+slide same-frame combo: both branches read the same stale
  onGround, so a grounded press of both yields a 20-frame airborne slide (the only reachable
  trigger for the restore latent above). Make the slide branch else-if / require !input.jump and
  pin the combo with a test.
- (M2 review nice-to-have) applyHeroInput without a world arg silently swallows the released
  shot but still resets fireHeld (charge consumed, no projectile). No in-repo caller does this;
  harden by skipping the whole release block (incl. counter reset) when world.projectiles is
  absent.
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
- 2026-06-10: v2 pre-launch tightening (Fable feasibility review; SPEC bumped to v2, D8–D11).
  B1: gate.sh removed from M0's hybrid-dev file list — orchestrator-authored RED at S3g, all
  milestones. B2/R8: M0/M1/M3 smokes pinned by mechanically runnable sed inversion proofs over
  single-line constants (EXPECTED_REST_Y, WIN_INPUTS, EXPECTED_ENEMIES_DEFEATED — M3 uses its
  own constant since truncating WIN_INPUTS reds the gate at smoke-playthrough first). B3:
  side-contact KNOCKBACK_VX=2 added to M3 + combat test, making the blocking corridor genuinely
  impassable. R1: cross-milestone test-freeze landmine added here + seeded into PITFALLS.md.
  R2: M1 spawn/settle/jump-arithmetic conventions pinned. R3: M0 hygiene greps made
  missing-dir-safe (git grep pathspec + git ls-files media ban). R4: demo.mjs RED
  strong-authored, trivially winnable v1; world.test uses inline literals only. R5: M2
  registry/projectile/slide clarifications + strong-verified test marking. R6: M3 combat-smoke
  vacuous-pass guard. R7: M4 racy manual http.server accept line deleted; control-hints
  key-sync made mechanical; HUD read-only export rule. No AC weakened.
- 2026-06-11: M0 merged (PR #1) — physics/collision oracle + real gate.sh (secrets→integrity→
  hygiene→unit→smoke-fall). Review booked two backlog items (determinism-grep extension,
  in-script gate watchdog). Note: test/index.js shim added so `node --test test/` resolves the
  directory on this Node version — future test files must keep the *.test.mjs naming it globs.
- 2026-06-11: M1 merged (PR #2) — level parser, world stepper, hero "Rivet", strong-authored
  demo.mjs (WIN_INPUTS: 67 right-only frames, win at step 67), playthrough smoke + gate growth
  step=smoke-playthrough with verified sed inversion proof. Review r1: 1 confirmed (out-of-budget
  .gitignore hunk reverted), 2 nice-to-haves booked in Backlog; r2 delta clean. hybrid-dev done
  in 0 fix rounds.
- 2026-06-11: M2 merged (PR #3) — registry (registerCharacter/createCharacter), projectile
  entity, robo kit (fire/charge-shot at the 29/30 boundary, 20-frame slide), world switches to
  createCharacter('robo'). 6 files, no structural gate growth (new tests run under step=unit).
  hybrid-dev done in 0 fix rounds; review r1: codex lane timed out (Lane A alone per protocol),
  0/3 findings confirmed — 3 nice-to-haves booked in Backlog (ceiling-safe slide restore,
  jump+slide combo, world-less applyHeroInput seam).
