import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SEER_CAPTURE, SEER_CONSENT, SEER_DIR, SEER_NAME_LIMIT, SEER_TOOL } from "../src/config.ts";
import { Seer, answerFor, saidAbout } from "../src/seer/capability.ts";
import { capture, captureWith, seerIsInstalled, standingWith, startConsentWith } from "../src/seer/drive.ts";

const A_WINDOW = "the app";

const ONE_PIXEL = "iVBORw0KGgoAAAANSUhEUg==";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-seer-"));
}

function withStatus(root: string, said: Record<string, readonly string[]>): { root: string; path: string } {
  const path = withSeer(root, `printf '%s' '${JSON.stringify(said)}'`);
  return { root, path };
}

function withSeer(root: string, body: string): string {
  const path = join(root, SEER_DIR, SEER_CAPTURE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  const shell = join(root, "fake-shell");
  writeFileSync(shell, `#!/bin/sh\n${body}\n`);
  chmodSync(shell, 0o755);
  return shell;
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

test("the tool exists exactly when a capture program does, and never otherwise", () => {
  const here = join(import.meta.dirname, "..");
  const offered = new Seer().tools().length;

  assert.equal(
    offered,
    seerIsInstalled(here) ? 1 : 0,
    "the see tool is offered when there is no program to run, or withheld when there is one. Whether an agent is told it can look must follow one fact: a capture program the person installed themselves.",
  );
});

test("a refusal from the consent process is a refusal, and no picture comes back", () => {
  const root = scratch();
  try {
    const shell = withSeer(root, "exit 5");
    const shot = captureWith(shell, root, A_WINDOW);
    assert.equal(shot.kind, "disarmed");

    const answer = answerFor(shot, A_WINDOW);
    assert.equal(
      answer.kind,
      "text",
      "a disarmed answer produced something other than words. looper does not decide consent and must never hand back an image the person did not allow.",
    );
    if (answer.kind !== "text") return;
    assert.ok(answer.text.includes("not ticked in the consent window"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a window that is not there is named, not guessed at", () => {
  const root = scratch();
  try {
    const shell = withSeer(root, "exit 3");
    const shot = captureWith(shell, root, A_WINDOW);
    assert.equal(shot.kind, "not-found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a picture only comes back when the seer says it may", () => {
  const root = scratch();
  try {
    const shell = withSeer(
      root,
      `printf '{"images":[{"label":"the app","media":"image/png","base64":"${ONE_PIXEL}"}],"missing":["the other one"]}'`,
    );

    const answer = answerFor(captureWith(shell, root, A_WINDOW), A_WINDOW);
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
    const shell = withSeer(root, "printf 'not json'");
    const shot = captureWith(shell, root, A_WINDOW);
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

  const asking = seer.call({ root: ".", tool: SEER_TOOL, args: new Map() });
  assert.equal(
    asking.kind,
    "text",
    "asking with no window is how an agent finds out what is ticked, and it must answer in words rather than refuse",
  );
});

test("a picture of a window that was not rendering says so beside the picture", () => {
  const seen = answerFor(
    {
      kind: "seen",
      images: [{ label: A_WINDOW, media: "image/png", base64: ONE_PIXEL, state: "minimised" }],
      missing: [],
    },
    A_WINDOW,
  );

  assert.equal(seen.kind, "shown");
  if (seen.kind !== "shown") return;
  assert.ok(
    seen.said.includes("what it last drew"),
    "a capture of a minimised window is honest and useless, and an agent will reason from it as though it were the running thing. That is the confident wrong answer the seer exists to prevent.",
  );
});

test("a seer that does not say what state the window was in is not believed", () => {
  const root = scratch();
  try {
    const shell = withSeer(
      root,
      `printf '{"images":[{"label":"the app","media":"image/png","base64":"${ONE_PIXEL}"}]}'`,
    );
    const shot = captureWith(shell, root, A_WINDOW);
    assert.equal(shot.kind, "seen");
    if (shot.kind !== "seen") return;
    assert.equal(shot.images[0]?.state, "unknown");

    const answer = answerFor(shot, A_WINDOW);
    assert.equal(answer.kind, "shown");
    if (answer.kind !== "shown") return;
    assert.ok(answer.said.includes("Treat it as unconfirmed"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a window that really was rendering is handed over without a warning attached", () => {
  const seen = answerFor(
    {
      kind: "seen",
      images: [{ label: A_WINDOW, media: "image/png", base64: ONE_PIXEL, state: "rendering" }],
      missing: [],
    },
    A_WINDOW,
  );
  assert.equal(seen.kind, "shown");
  if (seen.kind !== "shown") return;
  assert.equal(seen.said, `looked at "${A_WINDOW}".`);
});

test("a picture of a real window survives the pipe, which Node's default buffer would have thrown away", () => {
  const root = scratch();
  try {
    const wide = "A".repeat(3_000_000);
    const shell = withSeer(
      root,
      `printf '{"images":[{"label":"${A_WINDOW}","media":"image/png","base64":"'; printf '%s' '${wide}'; printf '","state":"rendering"}],"missing":[]}'`,
    );

    const shot = captureWith(shell, root, A_WINDOW);
    assert.equal(shot.kind, "seen");
    if (shot.kind !== "seen") return;
    assert.equal(shot.images.length, 1);
    assert.equal(shot.images[0]?.base64.length, wide.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper starts the consent window itself rather than naming a command for a person to type", () => {
  const root = scratch();
  try {
    const shell = withSeer(root, "exit 0");
    const consent = join(root, SEER_DIR, SEER_CONSENT);
    mkdirSync(dirname(consent), { recursive: true });
    writeFileSync(consent, "");

    const started = startConsentWith(shell, root);

    assert.equal(started.kind, "starting");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a machine with no copy of the consent window says that, instead of pretending it started one", () => {
  const root = scratch();
  try {
    const shell = withSeer(root, "exit 0");
    const started = startConsentWith(shell, root);

    assert.equal(
      started.kind,
      "no-consent-program",
      "reporting a start that did not happen sends the reader to look for a window that will never appear",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no message tells the person at the machine to type a command", () => {
  const source = readFileSync(join(import.meta.dirname, "..", "src", "seer", "capability.ts"), "utf8");

  assert.doesNotMatch(
    source,
    /starts it with|started by the person at this machine, with|start seer\/windows\/consent\.ps1 again/,
    "the only input is a sentence: a message that hands somebody a command to type is a step they have to know exists",
  );
});

test("a window nobody ticked is never named to the agent, however helpful that would be", () => {
  const secret = "Payroll 2026 final - Excel";
  const shell = withStatus(scratch(), { armed: ["the app"], open: ["the app", secret] });
  try {
    const said = saidAbout(standingWith(shell.path, shell.root));
    const text = said.kind === "text" ? said.text : JSON.stringify(said);

    assert.ok(text.length > 0, "an empty answer would pass the check below without meaning anything");
    assert.equal(
      text.includes(secret),
      false,
      "consent gates capture and must gate enumeration too: an agent that is told every window title learns what a person has open before they agreed to show it anything",
    );
    assert.equal(text.includes("the app"), true, "what was ticked is still named");
  } finally {
    rmSync(shell.root, { recursive: true, force: true });
  }
});
