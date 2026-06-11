"use strict";
// Directory-entry shim for the canonical gate command `node --test test/`.
//
// On Node >= 23 a positional directory arg to --test is spawned as a single entry
// (`node <dir>`), which CJS-resolves to <dir>/index.js — without this file the run
// dies with MODULE_NOT_FOUND before any test executes. This shim imports every
// test/*.test.mjs so the full suite runs in that spawned entry; assertion failures
// are reported by node:test and import-time errors reject the exported promise,
// either way exiting non-zero. Discovery is dynamic (readdirSync, sorted) so tests
// added in later milestones run without editing this file (it freezes on first
// commit per oracle-integrity). Bare `node --test` matches this file directly via
// the default `**/test/**` glob AND matches the *.test.mjs files themselves; the
// argv guard below makes the shim a no-op in that case so tests never run twice.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const entry = path.resolve(process.argv[1] || "");
if (entry === __dirname) {
  // Spawned as the directory entry (`node --test test/`): run the whole suite.
  module.exports = Promise.all(
    fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".test.mjs"))
      .sort()
      .map((f) => import(pathToFileURL(path.join(__dirname, f)).href))
  );
} else {
  // Matched as a plain file (e.g. bare `node --test`): the *.test.mjs files are
  // already their own entries — do nothing to avoid double-running.
  module.exports = Promise.resolve([]);
}
