import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { entropyOf, findingsIn, looksRandom } from "../src/secrets/detect.ts";
import { Secrets, scanMessage, scanStaged } from "../src/secrets/capability.ts";

const NOTHING_ALLOWED: ReadonlySet<string> = new Set();

function kindsAllowing(line: string, allowed: ReadonlySet<string>): readonly string[] {
  return findingsIn(line, allowed).map((held) => held.kind);
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-secrets-"));
  mkdirSync(join(root, "src"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@e.com"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "before"], { cwd: root, stdio: "ignore" });
  return root;
}

function stage(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
}

function kinds(line: string): readonly string[] {
  return kindsAllowing(line, NOTHING_ALLOWED);
}


const BODY = "zzzz1111zzzz1111zzzz1111zzzz";

const STRIPE = "sk_".concat("live_");

const GITLAB = "gl".concat("pat-");

test("vendor-shaped keys are caught by their shape, not by a list of names", () => {
  assert.deepEqual([...kinds('k = "AKIAZZZZ1111ZZZZ1111"')], ["an AWS access key"]);
  assert.deepEqual(
    [...kinds('k = "ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"')],
    ["a GitHub token"],
  );
  assert.deepEqual([...kinds(`k = "${GITLAB}${BODY}"`)], ["a GitLab token"]);
  assert.deepEqual([...kinds(`k = "${STRIPE}${BODY}"`)], ["a Stripe live key"]);
});

test("a database address carrying its password is caught", () => {
  assert.equal(kinds("DATABASE_URL=postgres://app:Tr0ub4dor3@db:5432/shop").length, 1);
  assert.equal(kinds("redis://user:s3cret@cache:6379").length, 1);
});

test("a private key block is caught", () => {
  assert.equal(kinds("-----BEGIN OPENSSH PRIVATE KEY-----").length, 1);
});

test("something named like a credential, with a real value, is caught", () => {
  assert.equal(kinds('const password = "Tr0ub4dor3xKQ99"').length, 1);
  assert.equal(kinds('apiKey: "8f4b2c9d1e6a3f7b0c5d"').length, 1);
});

test("the right way to write it is never flagged", () => {
  assert.deepEqual([...kinds("const key = process.env.API_KEY;")], []);
  assert.deepEqual([...kinds("const key = import.meta.env.VITE_KEY;")], []);
  assert.deepEqual([...kinds('password = "${DB_PASSWORD}"')], []);
  assert.deepEqual([...kinds('password = "change-me"')], []);
  assert.deepEqual([...kinds('token = "your-token-here"')], []);
});

test("a documented example key is not a leak, but a real one beside the word example is", () => {
  assert.deepEqual([...kinds('k = "AKIAIOSFODNN7EXAMPLE"')], []);
  assert.equal(kinds('k = "AKIAZZZZ1111ZZZZ1111" // just an example').length, 1);
});

test("ordinary code is left alone, which is what makes the rest believable", () => {
  assert.deepEqual([...kinds('export const VERSION = "1.2.3";')], []);
  assert.deepEqual([...kinds("const id = a3f5c9e1b2d4f6a89012;")], []);
  assert.deepEqual([...kinds('import { readFileSync } from "node:fs";')], []);
  assert.deepEqual([...kinds("  const excerpt = text.slice(0, 16);")], []);
});

test("entropy tells a random key from a long ordinary word", () => {
  assert.ok(looksRandom("Tr0ub4dor3xKQ99mZp2Wq7Lm4Xn"));
  assert.ok(!looksRandom("theQuickBrownFoxJumpedOverTheLazyDog"));
  assert.ok(entropyOf("aaaaaaaaaaaaaaaaaaaaaaaa") < 1);
});

test("a git hash and a uuid are not secrets", () => {
  assert.ok(!looksRandom("a3f5c9e1b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2"));
  assert.ok(!looksRandom("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
});

test("a commit carrying a key is refused, and says nothing was committed", () => {
  const root = repo();
  try {
    stage(root, "src/deploy.ts", 'const t = "ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz";\n');
    const outcome = new Secrets().onHook({
      root,
      event: "PreCommit",
      payload: { kind: "none" },
    });

    assert.equal(outcome.kind, "block");
    if (outcome.kind !== "block") return;
    assert.ok(outcome.reason.includes("Nothing was committed"));
    assert.ok(outcome.reason.includes("change the key at whoever issued it"));
    assert.ok(outcome.reason.includes("already has a copy of it"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only what is being added is scanned, so old files do not block every commit", () => {
  const root = repo();
  try {
    stage(root, "src/clean.ts", "export const rate = 0.2;\n");
    assert.deepEqual([...scanStaged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a value on the allow list, with the reason beside it, passes", () => {
  const root = repo();
  try {
    mkdirSync(join(root, ".looper"), { recursive: true });
    writeFileSync(
      join(root, ".looper/secrets.allow"),
      `# the public test key from the payment docs\n${STRIPE}${BODY}\n`,
    );
    stage(root, "src/pay.ts", `const k = "${STRIPE}${BODY}";\n`);

    assert.deepEqual([...scanStaged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the inline marker excuses one line and no others", () => {
  const root = repo();
  try {
    stage(
      root,
      "src/pay.ts",
      'const a = "ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"; // looper:allow-secret\nconst b = "ghp_yyyy2222yyyy2222yyyy2222yyyy2222yyyy";\n',
    );
    assert.equal(scanStaged(root).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("images and lockfiles are not scanned", () => {
  const root = repo();
  try {
    stage(root, "package-lock.json", '{"key":"ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"}\n');
    assert.deepEqual([...scanStaged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a key in the commit message is caught, not only in the files", () => {
  const root = repo();
  try {
    const caught = scanMessage(root, "rotated ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz\n");
    assert.equal(caught.length, 1);
    assert.equal(caught[0]?.file, "the commit message");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the commented lines git puts in the message are not scanned", () => {
  const root = repo();
  try {
    const message = "fix the thing\n\n# ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz\n";
    assert.deepEqual([...scanMessage(root, message)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ordinary message passes", () => {
  const root = repo();
  try {
    assert.deepEqual([...scanMessage(root, "rotate the deploy key\n\nIt leaked.\n")], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the agent typing a key into the commit command is caught before it runs", () => {
  const root = repo();
  try {
    const outcome = new Secrets().onHook({
      root,
      event: "PreToolUse",
      payload: {
        kind: "text",
        text: JSON.stringify({
          tool_name: "Bash",
          tool_input: {
            command: 'git commit -m "removed ghp_zzzz1111zzzz1111zzzz1111zzzz1111zzzz"',
          },
        }),
      },
    });
    assert.equal(outcome.kind, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
