import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INJECTION_BUDGET, RECALL_TOOL } from "../src/config.ts";
import { Recall } from "../src/recall/capability.ts";
import { forget, matching, parseNotes, readNotes, remember } from "../src/recall/store.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-recall-"));
}

function write(root: string, summary: string, note: string) {
  return new Recall().call({
    root,
    tool: RECALL_TOOL,
    args: new Map([
      ["summary", summary],
      ["note", note],
    ]),
  });
}

function readWith(root: string, args: ReadonlyMap<string, string>) {
  const result = new Recall().call({ root, tool: RECALL_TOOL, args });
  assert.equal(result.kind, "text");
  if (result.kind !== "text") throw new Error("unreachable");
  return result.text;
}

function read(root: string) {
  return readWith(root, new Map());
}


test("something worked out once survives into the next session", () => {
  const root = scratch();
  try {
    write(root, "the payment webhook retries for 3 days", "Verified against their dashboard.");
    assert.ok(read(root).includes("retries for 3 days"));
    assert.ok(read(root).includes("Verified against their dashboard"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writing the same summary again corrects it rather than duplicating it", () => {
  const root = scratch();
  try {
    write(root, "the webhook retries", "for 3 days");
    const second = write(root, "the webhook retries", "for 7 days, they changed it");

    assert.equal(readNotes(root).length, 1);
    assert.equal(second.kind, "text");
    if (second.kind !== "text") return;
    assert.ok(second.text.includes("corrected"));
    assert.ok(read(root).includes("7 days"));
    assert.ok(!read(root).includes("for 3 days"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a note that stops being true can be removed", () => {
  const root = scratch();
  try {
    write(root, "we use the v1 endpoint", "because v2 was not out yet");
    assert.ok(forget(root, "we use the v1 endpoint"));
    assert.equal(readNotes(root).length, 0);
    assert.equal(forget(root, "never written"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every note carries the date it was learned", () => {
  const root = scratch();
  try {
    write(root, "a thing", "some detail");
    const held = readNotes(root)[0];
    assert.ok(held !== undefined);
    assert.match(held.learned, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("notes can be searched, so a big memory stays usable", () => {
  const root = scratch();
  try {
    write(root, "the webhook retries for 3 days", "measured");
    write(root, "the map tiles are cached for an hour", "measured");

    assert.ok(readWith(root, new Map([["about", "webhook"]])).includes("retries"));
    assert.ok(!readWith(root, new Map([["about", "webhook"]])).includes("map tiles"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project with nothing written down says so, and injects nothing", () => {
  const root = scratch();
  try {
    assert.ok(read(root).includes("not written anything down yet"));
    assert.deepEqual([...new Recall().inject({ root, budget: INJECTION_BUDGET })], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("once there are notes, every turn is told they exist", () => {
  const root = scratch();
  try {
    write(root, "a thing", "some detail");
    const said = new Recall().inject({ root, budget: INJECTION_BUDGET });

    assert.equal(said.length, 1);
    assert.ok(first(said).text.includes("1 note"));
    assert.ok(first(said).text.length < 250, "it is paid for on every turn");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("half a note is refused rather than half written", () => {
  const root = scratch();
  try {
    const result = new Recall().call({
      root,
      tool: RECALL_TOOL,
      args: new Map([["note", "detail with no summary"]]),
    });
    assert.equal(result.kind, "text");
    if (result.kind !== "text") return;
    assert.ok(result.text.includes("needs both"));
    assert.equal(readNotes(root).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the file stays readable and correctable by hand", () => {
  const root = scratch();
  try {
    write(root, "a thing", "some detail");
    const text = readFileSync(join(root, ".looper/recall.md"), "utf8");

    assert.ok(text.includes("## "), "plain markdown, editable by anyone");
    assert.ok(text.includes("Delete an entry the moment it stops being true"));
    assert.equal(parseNotes(text).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("searching is case-insensitive, because nobody remembers how they wrote it", () => {
  const notes = [{ learned: "2026-08-17", summary: "The Webhook", body: "detail" }];
  assert.equal(matching(notes, "webhook").length, 1);
});

test("a note written with a hyphen is a note, because a project may forbid the dash", () => {
  const notes = parseNotes(
    "# What this project has learned\n\n## 2026-08-18 - the tile server has to be running\n\nA blank map means nothing is serving tiles.\n",
  );

  assert.equal(
    notes.length,
    1,
    "the heading did not parse, so the note was silently swallowed into whatever came before it. A project whose own rules ban the em dash cannot write a note looper will read.",
  );
  assert.equal(first(notes).summary, "the tile server has to be running");
});
