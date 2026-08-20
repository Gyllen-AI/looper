import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INJECTION_BUDGET, RECALL_TOOL } from "../src/config.ts";
import { abandonedBefore } from "../src/atomic.ts";
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
    assert.equal(forget(root, "we use the v1 endpoint").kind, "gone");
    assert.equal(readNotes(root).length, 0);
    assert.equal(forget(root, "never written").kind, "not-there");
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
    assert.ok(
      first(said).text.includes("a thing"),
      "a count cannot be acted on: a turn told only that notes exist has to spend a tool call to find out whether any of them matter",
    );
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

test("two writes at once keep both notes, because an agent is told to work in parallel", () => {
  const root = scratch();
  try {
    const first = remember(root, { learned: "2026-08-18", summary: "one", body: "first" });
    const second = remember(root, { learned: "2026-08-18", summary: "two", body: "second" });

    assert.notEqual(first.kind, "busy");
    assert.notEqual(second.kind, "busy");
    const notes = readNotes(root).map((held) => held.summary);
    assert.deepEqual([...notes].sort(), ["one", "two"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a write that cannot take the lock says so instead of reporting success", () => {
  const root = scratch();
  const path = join(root, ".looper", "recall.md");
  try {
    mkdirSync(join(root, ".looper"), { recursive: true });
    writeFileSync(`${path}.looper-lock`, "");

    const written = remember(root, { learned: "2026-08-18", summary: "lost", body: "x" });

    assert.equal(
      written.kind,
      "busy",
      "the note was reported as written while another process held the file. A note the agent believes it wrote, that nobody has, is the one failure recall exists to prevent.",
    );
    assert.deepEqual([...readNotes(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a note deleted for being wrong does not survive in a file beside it", () => {
  const root = scratch();
  try {
    remember(root, { learned: "2026-08-18", summary: "the wrong fact", body: "x" });
    remember(root, { learned: "2026-08-18", summary: "a second fact", body: "y" });
    forget(root, "the wrong fact");

    assert.equal(
      existsSync(join(root, ".looper", "recall.md.looper-backup")),
      false,
      "the note somebody deleted because it was wrong survived in a committed file one filename away, and it is the copy a future reader has no reason to distrust",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only a lock that was already dead when we arrived is swept", () => {
  const arrived = 1_000_000;

  assert.equal(
    abandonedBefore(arrived, arrived),
    false,
    "a lock written at the moment we arrived was called abandoned. Nothing that happens while we wait may make a live holder's lock look dead, or two writers end up on one file.",
  );
  assert.equal(
    abandonedBefore(arrived + 60_000, arrived),
    false,
    "a lock written after we arrived was called abandoned, which is a clock reading nobody can defend",
  );
  assert.equal(
    abandonedBefore(arrived - 6_000, arrived),
    true,
    "a lock already six seconds old when we arrived was not swept, so one crashed process wedges recall until somebody deletes the file by hand",
  );
});

test("waiting for a live lock never steals it, however slow the wait turns out to be", () => {
  const root = scratch();
  const path = join(root, ".looper", "recall.md");
  try {
    mkdirSync(join(root, ".looper"), { recursive: true });
    const lock = `${path}.looper-lock`;
    writeFileSync(lock, "");

    const written = remember(root, { learned: "2026-08-18", summary: "lost", body: "x" });

    assert.equal(written.kind, "busy");
    assert.ok(
      existsSync(lock),
      "the lock of a process still holding it was deleted. On a loaded macOS runner the 1 second wait took 5.3 seconds, which was long enough for the old check to read a live lock as five seconds old and take it.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lock left behind by a process that died is swept, and the write goes through", () => {
  const root = scratch();
  const path = join(root, ".looper", "recall.md");
  try {
    mkdirSync(join(root, ".looper"), { recursive: true });
    const lock = `${path}.looper-lock`;
    writeFileSync(lock, "");
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(lock, longAgo, longAgo);

    const written = remember(root, { learned: "2026-08-18", summary: "after the crash", body: "x" });

    assert.equal(written.kind, "added", "a lock nobody holds any more locked recall out for good");
    assert.equal(existsSync(lock), false, "the dead lock was left on disk to be swept again next time");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("naming the notes is bounded, so a project that has learned a lot is not read as wallpaper", () => {
  const root = scratch();
  try {
    for (let at = 0; at < 12; at += 1) write(root, `a thing numbered ${at}`, "some detail");
    const said = new Recall().inject({ root, budget: INJECTION_BUDGET });

    assert.match(first(said).text, /and 9 more/);
    assert.ok(
      first(said).text.length < 500,
      "a line paid on every turn that grows with every note becomes the thing naming was meant to fix",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
