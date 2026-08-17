import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SEER_DIR, SEER_NAME, SEER_NAME_LIMIT, SEER_TOOL } from "../src/config.ts";
import { Seer, answerFor } from "../src/seer/capability.ts";
import { capture, seerIsInstalled } from "../src/seer/drive.ts";

const A_WINDOW = "the app";

const ONE_PIXEL = "iVBORw0KGgoAAAANSUhEUg==";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-seer-"));
}

function withSeer(root: string, body: string): void {
  const where = join(root, SEER_DIR, process.platform);
  mkdirSync(where, { recursive: true });
  const path = join(where, SEER_NAME);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

test("a machine with no seer installed cannot be looked at, and says so", () => {
  const root = scratch();
  try {
    assert.equal(seerIsInstalled(root), false);
    const shot = capture(root, A_WINDOW);
    assert.equal(shot.kind, "not-installed");

    const answer = answerFor(shot, A_WINDOW);
    assert.equal(answer.kind, "text");
    if (answer.kind !== "text") return;
    assert.ok(answer.text.includes("Nothing was captured"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper offers no way to look at anything until somebody installs a seer", () => {
  assert.deepEqual(
    [...new Seer().tools()],
    [],
    "the tool is offered on a machine with no capture program, so installing looper would advertise the ability to look at a screen. Nothing about this may arrive with an install.",
  );
});

test("a refusal from the consent process is a refusal, and no picture comes back", () => {
  const root = scratch();
  try {
    withSeer(root, "exit 5");
    const shot = capture(root, A_WINDOW);
    assert.equal(shot.kind, "disarmed");

    const answer = answerFor(shot, A_WINDOW);
    assert.equal(
      answer.kind,
      "text",
      "a disarmed answer produced something other than words. looper does not decide consent and must never hand back an image the person did not allow.",
    );
    if (answer.kind !== "text") return;
    assert.ok(answer.text.includes("not armed"));
    assert.ok(answer.text.includes("asking again will not change the answer"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a window that is not there is named, not guessed at", () => {
  const root = scratch();
  try {
    withSeer(root, "exit 3");
    const shot = capture(root, A_WINDOW);
    assert.equal(shot.kind, "not-found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a picture only comes back when the seer says it may", () => {
  const root = scratch();
  try {
    withSeer(
      root,
      `printf '{"images":[{"label":"the app","media":"image/png","base64":"${ONE_PIXEL}"}],"missing":["the other one"]}'`,
    );

    const answer = answerFor(capture(root, A_WINDOW), A_WINDOW);
    assert.equal(answer.kind, "shown");
    if (answer.kind !== "shown") return;
    assert.equal(answer.images.length, 1);
    assert.equal(answer.images[0]?.base64, ONE_PIXEL);
    assert.ok(
      answer.said.includes("the other one"),
      "a window it could not find was dropped in silence, which reads as a complete answer and is not one",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a seer that answers with nonsense is unavailable, never a verdict", () => {
  const root = scratch();
  try {
    withSeer(root, "printf 'not json'");
    const shot = capture(root, A_WINDOW);
    assert.equal(shot.kind, "unavailable");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("what the agent asks for is checked before anything is started", () => {
  const seer = new Seer();
  const tooLong = seer.call({
    root: ".",
    tool: SEER_TOOL,
    args: new Map([["window", "x".repeat(SEER_NAME_LIMIT + 1)]]),
  });
  assert.equal(tooLong.kind, "text");

  const empty = seer.call({ root: ".", tool: SEER_TOOL, args: new Map() });
  assert.equal(empty.kind, "text");
  if (empty.kind !== "text") return;
  assert.ok(empty.text.includes("needs the title of a window"));
});
