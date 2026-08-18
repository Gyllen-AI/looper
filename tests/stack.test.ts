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

function project(): string {
  return mkdtempSync(join(tmpdir(), "looper-stack-"));
}

function judged(root: string, file: string): number {
  return undeclaredLanguagesIn(root, [file]).length;
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
    assert.ok(stackDocument(stack, "today").includes("an empty half means an empty half"));
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
