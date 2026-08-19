import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { STACK_PATH } from "../src/config.ts";
import { languagesListedIn, stackOf } from "../src/stack/read.ts";
import { stackDocument } from "../src/stack/write.ts";
import { undeclaredLanguagesIn } from "../src/law/stack.ts";
import { writeStackIfAbsent } from "../src/law/capability.ts";
import { surveyProject } from "../src/law/project.ts";
import type { Violation } from "../src/law/rule.ts";

function project(): string {
  return mkdtempSync(join(tmpdir(), "looper-stack-"));
}

function judged(root: string, file: string): number {
  return undeclaredLanguagesIn(root, [file]).length;
}

function surveyStatus(root: string): readonly Violation[] {
  return surveyProject(root, "everything", []).violations;
}

test("a project's stack is measured, never guessed", () => {
  const root = project();
  try {
    writeFileSync(join(root, "package.json"), "{}");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "one.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "src", "page.tsx"), "export const b = 1;\n");

    const stack = stackOf(root);

    assert.deepEqual(
      stack.backend.languages.map((held) => held.language),
      ["TypeScript"],
    );
    assert.ok(
      stack.backend.languages.some((held) => held.because.includes("package.json")),
      "the document says how looper knows, and a manifest is the strongest evidence there is",
    );
    assert.deepEqual(
      stack.frontend.languages.map((held) => held.language),
      ["TypeScript"],
      "a .tsx file is the interface half, which is the split looper already computes",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an empty half is written as empty, not as something plausible", () => {
  const root = project();
  try {
    writeFileSync(join(root, "Cargo.toml"), "[package]\nname = \"x\"\n");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "lib.rs"), "pub fn f() {}\n");

    const stack = stackOf(root);

    assert.deepEqual([...stack.frontend.languages], []);
    assert.ok(stackDocument(stack, "today", root).includes("an empty half means an empty half"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("with no document there is nothing to judge against, so the rule is silent", () => {
  const root = project();
  try {
    assert.equal(judged(root, "engine/loader.py"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a language the document lists is allowed", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), "| language | how looper knows |\n|---|---|\n| Python | 3 file(s) |\n");
    assert.equal(judged(root, "engine/loader.py"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a language the document does not list is refused", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), "| language | how looper knows |\n|---|---|\n| Rust | Cargo.toml |\n");

    assert.equal(
      judged(root, "jobs/queue.py"),
      1,
      "a Python file appeared in a project that is Rust, and nothing said so. That is how a codebase ends up with two runtimes nobody chose.",
    );
    assert.equal(judged(root, "api/src/lib.rs"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file in no language at all is not a claim about the stack", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), "| language | how looper knows |\n|---|---|\n| Rust | Cargo.toml |\n");
    assert.equal(judged(root, "docs/PLAN.md"), 0);
    assert.equal(judged(root, "Makefile"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the heading row is not read as a language", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), "| language | how looper knows |\n|---|---|\n| Rust | Cargo.toml |\n");
    const written = languagesListedIn(root);

    assert.equal(written.kind, "listed");
    if (written.kind !== "listed") return;
    assert.deepEqual([...written.languages], ["Rust"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the record writes itself at the end of a turn, because nobody types a command", () => {
  const root = project();
  try {
    writeFileSync(join(root, "Cargo.toml"), "[package]\nname = \"x\"\n");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "lib.rs"), "pub fn f() {}\n");

    assert.equal(existsSync(join(root, STACK_PATH)), false);
    const said = writeStackIfAbsent(root);

    assert.ok(
      existsSync(join(root, STACK_PATH)),
      "STACK:1 cannot fire without this document, so a document only `looper init` writes is a rule nobody who already adopted looper will ever get",
    );
    assert.ok(said.includes(STACK_PATH), "writing a file into somebody's project without saying so is not a thing looper does");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a record somebody already has is never rewritten", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), "| language | how looper knows |\n|---|---|\n| Rust | ours |\n");
    assert.equal(writeStackIfAbsent(root), "");
    assert.ok(readFileSync(join(root, STACK_PATH), "utf8").includes("ours"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a JavaScript file arriving in a project that never chose JavaScript is judged and said out loud", () => {
  const root = project();
  try {
    writeFileSync(join(root, "package.json"), "{}");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "one.ts"), "export const a = 1;\n");
    writeFileSync(join(root, STACK_PATH), stackDocument(stackOf(root), "2026-08-18", root));

    writeFileSync(join(root, "deploy.mjs"), "export const run = () => {};\n");

    assert.equal(
      surveyStatus(root).some((held) => held.rule.id === "STACK:1" && held.file === "deploy.mjs"),
      true,
      "a language nobody chose entered the project through a file extension the survey does not walk, so nothing ever saw it",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a JavaScript file is judged by the same law as a TypeScript one", () => {
  const root = project();
  try {
    writeFileSync(join(root, "package.json"), "{}");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "build.mjs"),
      "export async function work() { return 1; }\nexport function a() { try { work(); } catch {} }\n",
    );

    assert.equal(
      surveyStatus(root).some((held) => held.rule.id === "TS-ERROR:4"),
      true,
      "a swallowed failure in a .mjs file was not a verdict, because the file was never read",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the prescription is named at a path that is actually there", () => {
  const root = project();
  try {
    writeFileSync(join(root, "package.json"), "{}");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "one.ts"), "export const a = 1;\n");

    const said = stackDocument(stackOf(root), "2026-08-19", root);
    const named = /`([^`]*STACK\.md)`/.exec(said);
    assert.notEqual(named, null, `the document no longer names the prescription: ${said.slice(0, 200)}`);
    if (named === null) return;

    const where = named[1] === undefined ? "" : named[1];
    const full = where.startsWith("/") ? where : join(root, where);
    assert.ok(
      existsSync(full),
      `the document sends a reader to ${where}, and there is nothing there — which is the same defect as pointing the law at a file that does not exist`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function halved(backend: readonly string[], frontend: readonly string[]): string {
  const rows = (languages: readonly string[]): string =>
    languages.length === 0
      ? "_Nothing found._\n"
      : `| language | how looper knows |\n|---|---|\n${languages.map((l) => `| ${l} | measured |`).join("\n")}\n`;
  return `# What this project is built from\n\n## Backend\n\n${rows(backend)}\n## Frontend\n\n${rows(frontend)}`;
}

test("a language listed only for the backend does not license the interface", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), halved(["TypeScript"], []));

    assert.equal(
      judged(root, "web/app/page.tsx"),
      1,
      "the document says this project has no interface, and an interface file just appeared. A language listed under one half is not a decision about the other: that is how a front end gets built by an agent that only checked whether the language was mentioned somewhere.",
    );
    assert.equal(
      judged(root, "api/src/server.ts"),
      0,
      "the same language, in the half that does list it, is the decision the document records",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a language listed for the half the file is in is allowed", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), halved(["TypeScript"], ["TypeScript"]));
    assert.equal(judged(root, "web/app/page.tsx"), 0);
    assert.equal(judged(root, "api/src/server.ts"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a language listed only for the interface does not license the backend", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), halved([], ["TypeScript"]));
    assert.equal(judged(root, "api/src/server.ts"), 1);
    assert.equal(judged(root, "web/app/page.tsx"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a document with no halves in it still governs both, because somebody wrote it by hand", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), "| language | how looper knows |\n|---|---|\n| TypeScript | ours |\n");
    assert.equal(judged(root, "api/src/server.ts"), 0);
    assert.equal(
      judged(root, "web/app/page.tsx"),
      0,
      "a document written before halves existed cannot be read as refusing a half it never mentioned",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file in no language is not a claim about either half", () => {
  const root = project();
  try {
    writeFileSync(join(root, STACK_PATH), halved(["TypeScript"], []));
    assert.equal(judged(root, "web/app/globals.css"), 0);
    assert.equal(judged(root, "web/index.html"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
