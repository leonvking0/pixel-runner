export const meta = {
  name: 'hybrid-dev',
  description: 'Reusable end-to-end hybrid auto-dev: Opus plans/reviews/audits/fixes, local Qwen does heavy-lifting generation, deterministic gate (repo suite + Opus-authored tests + runtime). Runs on any repo via args={repo,task}. Greenfield + brownfield.',
  phases: [
    { title: 'Plan', detail: 'Opus: understand repo, discover gate commands, decompose into GREEN(Qwen)/RED(Opus) subtasks, author acceptance tests, branch' },
    { title: 'Generate', detail: 'Qwen generates new files (GREEN, parallel); Opus edits existing files directly (RED)' },
    { title: 'Gate', detail: 'run repo build/test/typecheck/lint + Opus-authored tests (+ runtime)' },
    { title: 'Review', detail: 'Opus reviews the diff for what the gate cannot see (necessary findings only)' },
    { title: 'Fix', detail: 'Opus applies DIRECT small edits for gate failures + review findings (never re-emits via Qwen); re-gate' },
  ],
}

// ---------------------------------------------------------------------------
// Config / args
// ---------------------------------------------------------------------------
// Decoupled rig config (was the 4 llm-code-bench couplings C1–C4). The Workflow
// runtime is a sandboxed JS context — no fs/env/__dirname/import.meta (verified) —
// so the harness location must arrive as a STRING: args.models (the ROADMAP M6
// interface) else the installer-baked DEFAULT_MODELS. lib/gen, the rig-env bridge,
// and scratch are derived from it just below the arg block (they need REPO/A.models).
const DEFAULT_MODELS = '/home/han/Github/pixel-runner/autodev/models.json'  // rewritten by autodev-init.sh

// args arrives as a JSON STRING (not a parsed object), so parse it defensively.
let A = {}
try { A = typeof args === 'string' && args.trim() ? JSON.parse(args) : (args && typeof args === 'object' ? args : {}) }
catch (e) { log(`ERROR: could not parse args as JSON: ${e.message}`); return { error: 'args not valid JSON', raw: args } }

const REPO = A.repo
const TASK = A.task
const MODE = A.mode || 'auto'                               // auto | greenfield | brownfield
const MAX_FIX_ROUNDS = A.max_fix_rounds != null ? A.max_fix_rounds : 3
const DO_COMMIT = !!A.commit                                // default false: leave changes on the branch, uncommitted
const BRANCH = A.branch || null                             // default: planner derives hybrid-dev/<slug>

// Decoupled rig paths (C1–C4), derived from models.json via string ops only (the
// Workflow runtime has no fs/path module). These keep the SAME names the gen
// prompt already references, so only their DEFINITIONS changed, not their uses.
const MODELS = A.models || DEFAULT_MODELS                   // C1: abs path to models.json
const HARNESS_LIB = `${MODELS.slice(0, MODELS.lastIndexOf('/'))}/lib/gen`   // sibling lib/gen of models.json
const QWEN_GEN = `${HARNESS_LIB}/hybrid_gen.py`             // C2: bundled weak-model generation primitive
const RESOLVE_MODEL = `${HARNESS_LIB}/resolve_model.py`     // C3 bridge: models.json -> LLM_* env (replaces config.env)
// C3 env-load is inlined per-subtask in genPrompt (resolve_model.py -> a scoped
// llm-<id>.env, then `source`) — NOT `eval`, so it never trips deny group G
// (doc 07 §1.1) and parallel GREEN subtasks never share one env file.
const SCRATCH = `${REPO}/.autodev/.hybrid`                  // C4: repo-relative, gitignored (was llm-code-bench/.hybrid)

if (!REPO || !TASK) {
  log('ERROR: hybrid-dev requires args.repo (absolute path) and args.task (description). Aborting.')
  return { error: 'missing args.repo or args.task', got: { repo: REPO, task: TASK } }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['mode', 'summary', 'stack', 'branch', 'gate_commands', 'subtasks', 'acceptance_plan', 'risks'],
  properties: {
    mode: { type: 'string', enum: ['greenfield', 'brownfield'] },
    summary: { type: 'string', description: 'what the change does, in 2-3 sentences' },
    stack: { type: 'string', description: 'language/framework/test-runner detected (or chosen for greenfield)' },
    branch: { type: 'string', description: 'the working branch created for this task' },
    gate_commands: {
      type: 'object', additionalProperties: false,
      required: ['build', 'test', 'typecheck', 'lint', 'run'],
      properties: {
        build: { type: 'string', description: 'shell cmd from repo root, or "" if none' },
        test: { type: 'string' }, typecheck: { type: 'string' },
        lint: { type: 'string' }, run: { type: 'string', description: 'how to launch the app/CLI for runtime verification, or ""' },
      },
    },
    subtasks: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title', 'regime', 'files', 'instruction', 'landmines'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          regime: { type: 'string', enum: ['GREEN', 'RED'] },
          files: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths this subtask creates (GREEN) or edits (RED)' },
          instruction: { type: 'string', description: 'capacity-matched implementation detail for the executor' },
          landmines: { type: 'array', items: { type: 'string' }, description: 'GREEN: traps to front-load as MUST/MUST-NOT (empty for RED)' },
        },
      },
    },
    acceptance_plan: { type: 'string', description: 'what new-behavior tests to author in the next step' },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const TESTAUTHOR_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['test_files', 'run_command', 'ok', 'note'],
  properties: {
    test_files: { type: 'array', items: { type: 'string' } },
    run_command: { type: 'string', description: 'how to run JUST these acceptance tests from repo root' },
    ok: { type: 'boolean' },
    note: { type: 'string' },
  },
}

const GEN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'ok', 'files_written', 'qwen_completion_tokens', 'note'],
  properties: {
    id: { type: 'string' },
    ok: { type: 'boolean', description: 'true if hybrid_gen wrote the file(s) and they look syntactically plausible' },
    files_written: { type: 'array', items: { type: 'string' } },
    qwen_completion_tokens: { type: 'number' },
    note: { type: 'string' },
  },
}

const EDIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'ok', 'files_changed', 'note'],
  properties: {
    id: { type: 'string' },
    ok: { type: 'boolean' },
    files_changed: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
}

const GATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['passed', 'results', 'summary'],
  properties: {
    passed: { type: 'boolean', description: 'true iff every command that exists exited 0' },
    results: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['command', 'kind', 'ok', 'output_tail'],
        properties: {
          command: { type: 'string' },
          kind: { type: 'string', description: 'build|test|typecheck|lint|acceptance|runtime' },
          ok: { type: 'boolean' },
          output_tail: { type: 'string', description: 'last ~25 lines of output (failures especially)' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['decision', 'findings', 'summary'],
  properties: {
    decision: { type: 'string', enum: ['accept', 'revise'] },
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'file', 'line', 'issue', 'fix_hint'],
        properties: {
          severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
          file: { type: 'string' }, line: { type: 'string' },
          issue: { type: 'string' }, fix_hint: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const FIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'files_changed', 'addressed', 'note'],
  properties: {
    ok: { type: 'boolean' },
    files_changed: { type: 'array', items: { type: 'string' } },
    addressed: { type: 'array', items: { type: 'string' }, description: 'which gate failures / findings were fixed' },
    note: { type: 'string' },
  },
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function planPrompt() {
  return `You are the PLANNER + AUDITOR (strong model, Opus) in a hybrid auto-dev pipeline. A local WEAK model (Qwen 27B) will do the heavy lifting — it generates ENTIRE new self-contained files in one shot from your per-file instructions. You (Opus) do all planning, review, and direct fixes. The division you must encode:
- GREEN (delegate to Qwen): a NEW, self-contained file whose content is mostly fresh code with a clear spec. Qwen writes the whole file from your instruction.
- RED (you/Opus do it directly later): edits to EXISTING files, cross-file integration/wiring, anything diagnosis-dense or where the change is small relative to the surrounding context (re-emitting it via Qwen would cost more than it saves).

Repository: ${REPO}
Requested mode: ${MODE} (if "auto", infer greenfield vs brownfield from the repo state)
TASK: ${TASK}

Do this:
1. cd ${REPO}. Inspect the repo: detect language/framework, the test runner, and the build/test/typecheck/lint commands (read package.json scripts, Makefile, pyproject.toml, Cargo.toml, etc.). For a near-empty repo, treat as greenfield and CHOOSE a minimal stack + test runner.
2. Create a working branch so all work is reversible: ${BRANCH ? `git checkout -b ${BRANCH}` : 'git checkout -b hybrid-dev/<short-slug-from-task> (report the exact name in "branch")'}. If the repo has no commits yet, make an initial commit first so the branch is valid. Do NOT touch main/master directly.
3. Decompose the TASK into subtasks, each tagged GREEN or RED:
   - Make GREEN subtasks file-DISJOINT (they run in parallel) and each a single new file in "files".
   - For each GREEN subtask write a capacity-matched "instruction" (concrete, prescriptive — weak executors need detail) and "landmines" (the specific traps for THIS file as MUST/MUST-NOT; front-load ALL constraints because Qwen emits the whole file in one shot and won't get a second planning pass).
   - RED subtasks: list the existing files to edit and a precise "instruction"; leave "landmines" empty.
4. Report gate_commands (build/test/typecheck/lint and a "run" command for runtime verification; use "" for any that don't apply). These are the repo's OWN quality bar.
5. acceptance_plan: describe the machine-checkable tests for the NEW behavior that the next step will author.
6. risks: anything that could break or is ambiguous.

Return the PLAN. Do NOT generate feature code yet — only create the branch and (for greenfield) any minimal scaffold/config needed for the test runner to exist, including a .gitignore covering caches/build artifacts (__pycache__, .mypy_cache, .ruff_cache, node_modules, dist, target, etc.) so the gate's tool caches don't pollute the diff.`
}

function testAuthorPrompt(plan) {
  return `You are the TEST AUTHOR (strong model, Opus) in a hybrid auto-dev pipeline. Write machine-checkable acceptance tests for the NEW behavior of this task, into ${REPO} on branch ${plan.branch}. These tests are part of the deterministic gate (alongside the repo's existing suite).

TASK: ${TASK}
Stack / test runner: ${plan.stack}
Acceptance plan: ${plan.acceptance_plan}
Planned subtasks (what will be implemented): ${JSON.stringify(plan.subtasks.map(s => ({ id: s.id, title: s.title, files: s.files })))}

Do this:
1. cd ${REPO} (you are on branch ${plan.branch}).
2. Write focused tests that assert the task's required new behavior — test through the real public interface (function/CLI/API/route), not internals. Cover the happy path AND the key edge cases / failure modes the task implies. Use the repo's existing test framework/conventions; match file placement and naming.
3. The implementation does NOT exist yet, so these tests are EXPECTED to fail now (red). That's correct — do not stub the implementation to make them pass.
4. Give the exact command to run JUST these acceptance tests from repo root.

Return the list of test files you created, the run command, ok, and a note. Write ONLY test files here.`
}

function genPrompt(plan, st) {
  const target = st.files[0]
  return `You are a THIN DRIVER for the WEAK model (Qwen) in a hybrid auto-dev pipeline. Your ONLY job is to assemble an instruction and invoke the local Qwen generation primitive to create ONE new file. You MUST NOT write or fix the code yourself — ALL code for this file comes from Qwen. If generation fails, report it; do not substitute your own implementation.

Subtask ${st.id}: ${st.title}
Target file (repo-relative): ${target}   (absolute: ${REPO}/${target})
Repo: ${REPO}  (branch ${plan.branch}), stack: ${plan.stack}

Steps (run exactly):
1. Write the Qwen instruction to a temp file ${SCRATCH}/gen-${st.id}.txt (inside the target repo's gitignored .autodev/.hybrid — never tracked) containing:
   - A short context header: the task, the stack, and how THIS file fits (its role, what imports/exports/interfaces it must expose so sibling files and the acceptance tests can use it).
   - The implementation instruction:
${st.instruction}
   - A "MUST / MUST-NOT" list built from these landmines (front-load every constraint):
${(st.landmines || []).map(l => `     - ${l}`).join('\n') || '     (none provided — still demand: no console/runtime errors, follow repo conventions, complete runnable file)'}
2. Generate the file with the local rig:
   mkdir -p ${SCRATCH} && cd ${REPO} && python3 ${RESOLVE_MODEL} --role weak --config ${MODELS} > ${SCRATCH}/llm-${st.id}.env && set -a && source ${SCRATCH}/llm-${st.id}.env && set +a && python3 ${QWEN_GEN} --target ${REPO}/${target} --instruction ${SCRATCH}/gen-${st.id}.txt
   (weak GREEN model @ local vLLM; profile resolved from ${MODELS})
3. Parse hybrid_gen's JSON stdout. Confirm the target file now exists and is non-trivial. Do a cheap syntax sanity check ONLY (e.g. node --check / python -m py_compile / tsc --noEmit on the single file if quick) — do NOT fix anything; if it's broken, report ok=false with the reason (a later Opus fix round handles it).

Return: id="${st.id}", ok, files_written (the target if written), qwen_completion_tokens (from the JSON), note (include hybrid_gen's finish_reason and any syntax-check result). You write NO feature code.`
}

function editPrompt(plan, st) {
  return `You are the strong model (Opus) performing a RED subtask: a direct edit to EXISTING file(s) in a hybrid auto-dev pipeline. This is integration/wiring/diagnosis-dense work that is NOT delegated to the weak model.

Subtask ${st.id}: ${st.title}
Files to edit (repo-relative): ${JSON.stringify(st.files)}
Repo: ${REPO} (branch ${plan.branch}), stack: ${plan.stack}
Instruction:
${st.instruction}

Do this:
1. cd ${REPO}. Read the listed files and any siblings you must integrate with (e.g. the new GREEN files just generated).
2. Make the SMALLEST correct edits to accomplish the subtask. Use surgical diffs — do not rewrite whole files. Follow the repo's conventions.
3. Do a cheap local sanity check of what you changed if quick.

Return id="${st.id}", ok, files_changed, note. Keep edits minimal and integration-focused.`
}

function gatePrompt(plan, tests) {
  return `You are the GATE (deterministic + runtime) in a hybrid auto-dev pipeline. Run the project's own quality bar plus the authored acceptance tests, and report a machine-readable verdict. Do NOT fix anything — only run and observe.

Repo: ${REPO} (branch ${plan.branch})
Run each NON-EMPTY command below from repo root; capture exit code + the last ~25 lines of output:
- build:     ${plan.gate_commands.build || '(none)'}
- typecheck: ${plan.gate_commands.typecheck || '(none)'}
- lint:      ${plan.gate_commands.lint || '(none)'}
- test (repo suite): ${plan.gate_commands.test || '(none)'}
- acceptance tests:  ${tests && tests.run_command ? tests.run_command : '(none authored)'}
- runtime: ${plan.gate_commands.run ? `launch via \`${plan.gate_commands.run}\` and confirm it starts / does the core action without error (smallest path that exercises the new behavior); kill it after.` : '(no run command — skip runtime)'}

Rules:
- For each command produce a result {command, kind, ok, output_tail}.
- passed = true ONLY if every command that exists exited 0 (and runtime, if applicable, ran clean).
- A network error fetching an EXTERNAL resource that the test environment simply can't reach is environmental — note it but do not count it as a code failure (say so explicitly in output_tail).
Return passed, results[], summary.`
}

function reviewPrompt(plan) {
  return `You are the REVIEWER + AUDITOR (strong model, Opus) in a hybrid auto-dev pipeline. Review the changes on this branch for what the deterministic gate CANNOT see.

Repo: ${REPO} (branch ${plan.branch})
TASK: ${TASK}

Do this:
1. cd ${REPO}. Read the diff: \`git diff main...${plan.branch}\` (or against the base branch / initial commit). Read the changed files in full where needed.
2. Audit for: correctness bugs the tests miss, security/injection/data-correctness (must-fix regardless of score), spec violations vs the TASK, broken integration between the Qwen-generated files and the rest, and dead/unsafe code.
3. Decision: "accept" if the change correctly and safely satisfies the TASK. "revise" if there is at least one must-fix finding. Bias toward accept; report should-fix/nit separately but they do not by themselves force "revise".

Return decision, findings[] (each {severity, file, line, issue, fix_hint}), summary. Findings must cite real file:line. Be precise and necessary — every must-fix should be something that would actually break or be wrong.`
}

function fixPrompt(plan, gate, review) {
  const gateFails = (gate && gate.results ? gate.results.filter(r => !r.ok) : [])
  const mustFix = (review && review.findings ? review.findings.filter(f => f.severity === 'must-fix') : [])
  return `You are the strong model (Opus) performing the FIX step in a hybrid auto-dev pipeline. Apply DIRECT, surgical edits to fix the failures below. CRITICAL CONSTRAINT: fixes are small — you edit the files directly with diffs. Do NOT regenerate whole files and do NOT call the weak model; re-emitting a whole file to change a few lines is exactly the anti-pattern this pipeline avoids.

Repo: ${REPO} (branch ${plan.branch})
TASK: ${TASK}

GATE FAILURES to fix:
${gateFails.length ? gateFails.map(r => `- [${r.kind}] ${r.command}\n    ${(r.output_tail || '').replace(/\n/g, '\n    ')}`).join('\n') : '(gate passed — no gate failures)'}

REVIEW MUST-FIX findings:
${mustFix.length ? mustFix.map(f => `- ${f.file}:${f.line} — ${f.issue} (hint: ${f.fix_hint})`).join('\n') : '(no must-fix findings)'}

Do this:
1. cd ${REPO}. For each failure, locate the root cause (read the failing test output and the implicated code) and apply the SMALLEST correct edit. Prefer fixing the implementation; only change a test if the test itself is wrong.
2. Do not introduce new failures. Re-read your edits.

Return ok, files_changed, addressed (which failures/findings you fixed), note. Surgical diffs only.`
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
phase('Plan')
log(`hybrid-dev: repo=${REPO} | task="${TASK}" | mode=${MODE} | max_fix_rounds=${MAX_FIX_ROUNDS}`)

const plan = await agent(planPrompt(), { schema: PLAN_SCHEMA, label: 'plan+audit', phase: 'Plan' })
if (!plan) return { error: 'planning failed/skipped' }
log(`plan: mode=${plan.mode}, branch=${plan.branch}, ${plan.subtasks.length} subtasks (${plan.subtasks.filter(s => s.regime === 'GREEN').length} GREEN / ${plan.subtasks.filter(s => s.regime === 'RED').length} RED), stack=${plan.stack}`)

const tests = await agent(testAuthorPrompt(plan), { schema: TESTAUTHOR_SCHEMA, label: 'acceptance-tests', phase: 'Plan' })

// EXECUTE: GREEN in parallel (Qwen), then RED sequentially (Opus integration)
phase('Generate')
const greenTasks = plan.subtasks.filter(s => s.regime === 'GREEN')
const redTasks = plan.subtasks.filter(s => s.regime === 'RED')

const genResults = (await parallel(greenTasks.map(st => () =>
  agent(genPrompt(plan, st), { schema: GEN_SCHEMA, label: `gen:${st.id}`, phase: 'Generate' })
))).filter(Boolean)
const qwenTokens = genResults.reduce((a, r) => a + (r.qwen_completion_tokens || 0), 0)
log(`GREEN done: ${genResults.filter(r => r.ok).length}/${greenTasks.length} files generated by Qwen (${qwenTokens} completion tokens)`)

const editResults = []
for (const st of redTasks) {
  const r = await agent(editPrompt(plan, st), { schema: EDIT_SCHEMA, label: `edit:${st.id}`, phase: 'Generate' })
  if (r) editResults.push(r)
}
if (redTasks.length) log(`RED done: ${editResults.filter(r => r.ok).length}/${redTasks.length} integration edits by Opus`)

// GATE -> REVIEW -> FIX loop
let opusFixTouches = 0
let round = 0
let gate = null, review = null
const fixHistory = []
while (round <= MAX_FIX_ROUNDS) {
  phase('Gate')
  gate = await agent(gatePrompt(plan, tests), { schema: GATE_SCHEMA, label: `gate-r${round}`, phase: 'Gate' })
  phase('Review')
  review = await agent(reviewPrompt(plan), { schema: REVIEW_SCHEMA, label: `review-r${round}`, phase: 'Review' })

  const gatePassed = gate && gate.passed
  const reviewAccept = review && review.decision === 'accept'
  const mustFix = review && review.findings ? review.findings.filter(f => f.severity === 'must-fix') : []
  log(`round ${round}: gate=${gatePassed ? 'PASS' : 'FAIL'}, review=${review ? review.decision : 'n/a'} (${mustFix.length} must-fix)`)

  if (gatePassed && reviewAccept) break
  if (round === MAX_FIX_ROUNDS) break

  phase('Fix')
  const fix = await agent(fixPrompt(plan, gate, review), { schema: FIX_SCHEMA, label: `fix-r${round}`, phase: 'Fix' })
  opusFixTouches++
  fixHistory.push({ round, gate_passed: gatePassed, must_fix: mustFix.length, addressed: fix ? fix.addressed : [], files_changed: fix ? fix.files_changed : [] })
  round++
}

// REPORT
const finalGatePass = gate && gate.passed
const finalAccept = review && review.decision === 'accept'
const rep = await agent(
  `cd ${REPO} (branch ${plan.branch}). Stage all task changes so they appear in a diff: run \`git add -A\`. Then output verbatim: (1) \`git diff --cached --stat\` and (2) \`git status --short\`. ${DO_COMMIT ? `Then commit on branch ${plan.branch} with a concise message summarizing the task (do NOT touch main/master, do NOT push).` : 'Do NOT commit — leave the changes STAGED on the branch so they are easy to inspect and diff.'} Return the \`git diff --cached --stat\` text.`,
  { label: 'report', phase: 'Fix' }
)
const diffStat = rep

const summary = {
  repo: REPO, task: TASK, branch: plan.branch, mode: plan.mode,
  status: finalGatePass && finalAccept ? 'done' : (finalGatePass ? 'gate-pass-review-open' : 'incomplete'),
  gate_passed: !!finalGatePass,
  review_decision: review ? review.decision : 'n/a',
  open_must_fix: review && review.findings ? review.findings.filter(f => f.severity === 'must-fix') : [],
  subtasks: { green: greenTasks.length, red: redTasks.length },
  green_generated_ok: genResults.filter(r => r.ok).length,
  acceptance_tests: tests ? tests.test_files : [],
  fix_rounds_used: round,
  cost: {
    qwen_completion_tokens: qwenTokens,
    opus_touches: 1 /*plan*/ + (tests ? 1 : 0) + redTasks.length + (round + 1) /*gates*/ + (round + 1) /*reviews*/ + opusFixTouches,
    opus_breakdown: { plan: 1, test_author: tests ? 1 : 0, red_edits: redTasks.length, gates: round + 1, reviews: round + 1, fixes: opusFixTouches },
  },
  committed: DO_COMMIT,
  diff_stat: diffStat,
  gate_results: gate ? gate.results : [],
  fix_history: fixHistory,
}
log(`DONE: status=${summary.status}, gate=${finalGatePass ? 'PASS' : 'FAIL'}, fix_rounds=${round}, Qwen ${qwenTokens} tok, Opus ${summary.cost.opus_touches} touches`)
return summary
