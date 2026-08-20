import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NO_TURN } from "../src/capability.ts";
import { Recall } from "../src/recall/capability.ts";
import { asked, mostRelevant, pathWords, wordsOf } from "../src/recall/relevance.ts";
import { NEVER_SAID } from "../src/said.ts";
import { first } from "./helpers.ts";

const NOTES = [
  { learned: "2026-08-18", summary: "the injection budget is 9800 chars", body: "measured on the dev box" },
  { learned: "2026-08-20", summary: "the map identity comes from the open wipe", body: "identity_of joins server_wipe to map_identity; a new seed needs the census" },
  { learned: "2026-08-20", summary: "cargo ship docking lasts 480 seconds", body: "dock_time is a convar; the ship holds no arrival so the plugin times it" },
];

test("words are the long ones that are not glue", () => {
  assert.deepEqual([...wordsOf("Is the dev companion showing the correct map?")], ["companion", "showing", "correct"]);
  assert.deepEqual([...pathWords(["crates/client/ui/src/map/engine.ts"])], ["crates", "client", "engine"]);
});

test("the notes named are the ones the prompt and the files in hand reach for, and a stray word is not enough", () => {
  const hits = mostRelevant(NOTES, asked("is the companion showing the correct map identity after the wipe", []));
  assert.deepEqual(hits.map((one) => one.summary), ["the map identity comes from the open wipe"]);
  assert.deepEqual([...mostRelevant(NOTES, asked("how long does the cargo ship dock", []))].map((one) => one.summary), [
    "cargo ship docking lasts 480 seconds",
  ]);
  assert.deepEqual([...mostRelevant(NOTES, asked("restart the game server please", []))], []);
  assert.deepEqual(
    [...mostRelevant(NOTES, asked("how is the cargo going", []))],
    [],
    "one word in common is a coincidence, not a topic",
  );
  assert.deepEqual(
    [...mostRelevant(NOTES, asked("", ["crates/backend/src/store/wipe_identity.rs"]))].map((one) => one.summary),
    ["the map identity comes from the open wipe"],
    "a file in hand asks for the notes about its own names",
  );
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-recall-"));
  mkdirSync(join(root, ".looper"), { recursive: true });
  writeFileSync(
    join(root, ".looper", "recall.md"),
    `# What this project has learned\n\n${NOTES.map((one) => `## ${one.learned} — ${one.summary}\n${one.body}`).join("\n\n")}\n`,
  );
  return root;
}

test("the recall notice names what touches the prompt, and otherwise says once that the tool exists", () => {
  const root = project();
  try {
    const hit = new Recall().inject({
      root,
      budget: 9800,
      said: NEVER_SAID,
      turn: { ...NO_TURN, prompt: "is the map identity right after the wipe", inHand: { kind: "given", paths: [] } },
    });
    assert.match(first(hit).text, /map identity comes from the open wipe/);
    assert.ok(!first(hit).text.includes("injection budget"), "the oldest note is not named for being oldest");
    assert.equal(first(hit).notice, true);

    const miss = new Recall().inject({
      root,
      budget: 9800,
      said: NEVER_SAID,
      turn: { ...NO_TURN, prompt: "restart the game server", inHand: { kind: "given", paths: [] } },
    });
    assert.match(first(miss).text, /3 thing\(s\)/);
    assert.ok(!first(miss).text.includes("injection budget"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
