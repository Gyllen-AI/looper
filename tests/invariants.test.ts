import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const SOCKET_CAPABLE: readonly string[] = [
  "node:net",
  "node:http",
  "node:https",
  "node:http2",
  "node:tls",
  "node:dgram",
  "node:dns",
];

const SPAWN_CAPABLE = "node:child_process";

const SPAWN_SANCTUM = "git.ts";

const ARGUED_FOR: readonly string[] = ["@babel/parser"];

const INSTALL_HOOKS: readonly string[] = ["preinstall", "install", "postinstall"];

function sourceFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

function manifestAt(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed));
  return { ...parsed };
}

function names(field: string): readonly string[] {
  const table = manifestAt(join(ROOT, "package.json"))[field];
  if (table === undefined) return [];
  assert.ok(table !== null && typeof table === "object");
  return Object.keys(table);
}

function installedPackages(): readonly string[] {
  const modules = join(ROOT, "node_modules");
  if (!existsSync(modules)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(modules)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(join(modules, entry))) {
        found.push(join(modules, entry, scoped));
      }
      continue;
    }
    found.push(join(modules, entry));
  }
  return found;
}

test("nothing we wrote can open a socket", () => {
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const banned of SOCKET_CAPABLE) {
      assert.ok(
        !text.includes(`"${banned}"`),
        `${file} imports ${banned}. looper runs on every edit and every commit and must not be able to reach the network.`,
      );
    }
  }
});

test("nothing we installed can open a socket either", () => {
  const modules = join(ROOT, "node_modules");
  if (!existsSync(modules)) return;
  const hits = grepTree(modules);
  assert.deepEqual(
    hits,
    [],
    `these installed files reach for the network: ${hits.join(", ")}. The invariant is about the resolved tree, not our own files: a dependency that can open a socket makes looper able to phone home whether we call it or not.`,
  );
});

function grepTree(dir: string): readonly string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      hits.push(...grepTree(path));
      continue;
    }
    if (!/\.(js|cjs|mjs)$/.test(entry)) continue;
    const text = readFileSync(path, "utf8");
    for (const banned of SOCKET_CAPABLE) {
      const bare = banned.slice("node:".length);
      if (
        text.includes(`require("${banned}")`) ||
        text.includes(`require('${banned}')`) ||
        text.includes(`require("${bare}")`) ||
        text.includes(`require('${bare}')`) ||
        text.includes(`from "${banned}"`) ||
        text.includes(`from '${banned}'`)
      ) {
        hits.push(`${path} (${banned})`);
      }
    }
  }
  return hits;
}

const MAY_SPAWN: readonly string[] = [SPAWN_SANCTUM, "law/rust/drive.ts"];

test("only the named files may start another process, and each says what it starts", () => {
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(`"${SPAWN_CAPABLE}"`)) continue;
    assert.ok(
      MAY_SPAWN.some((allowed) => file.endsWith(allowed)),
      `${file} can start another process and is not on the list. Starting a process is only as safe as the thing being started, so every one lives in a named file and the list is short enough to read: ${MAY_SPAWN.join(", ")}.`,
    );
  }
});

test("the files that may start a process start only what they were allowed to", () => {
  const starts: Record<string, string> = {
    [SPAWN_SANCTUM]: '"git"',
    "law/rust/drive.ts": '"cargo"',
  };
  for (const [file, expected] of Object.entries(starts)) {
    const text = readFileSync(join(ROOT, "src", file), "utf8");
    assert.ok(
      text.includes(`execFileSync(${expected}`) || text.includes("execFileSync(builtAt("),
      `${file} is allowed to start ${expected} and looper's own Rust program, and nothing else.`,
    );
  }
});

test("every dependency is one that was argued for by name", () => {
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of names(field)) {
      assert.ok(
        ARGUED_FOR.includes(name),
        `${name} is installed and is not in the argued-for list. Every dependency is a decision written down in PLAN.md before it lands, and this list is the record that it was.`,
      );
    }
  }
});

test("no dependency runs code at install time", () => {
  for (const path of installedPackages()) {
    const manifest = join(path, "package.json");
    if (!existsSync(manifest)) continue;
    const scripts = manifestAt(manifest)["scripts"];
    if (scripts === undefined || scripts === null || typeof scripts !== "object") {
      continue;
    }
    for (const hook of INSTALL_HOOKS) {
      assert.ok(
        !(hook in scripts),
        `${path} runs a ${hook} script. An install script executes on every machine that installs looper, before anyone has read a line of it.`,
      );
    }
  }
});

test("the lockfile is committed, because the invariant is about resolved versions", () => {
  assert.ok(
    existsSync(join(ROOT, "package-lock.json")),
    "a tree that resolves freshly each time proves nothing about what anyone actually builds, so the resolved versions are pinned and committed",
  );
});

const PUBLISHABLE: readonly string[] = ["LICENSE", "CONTRIBUTING.md", "README.md"];

test("everything a public repository owes a reader is present", () => {
  for (const file of PUBLISHABLE) {
    assert.ok(existsSync(join(ROOT, file)), `${file} is missing, and a public fork needs it`);
  }
  const licence = readFileSync(join(ROOT, "LICENSE"), "utf8");
  assert.ok(licence.includes("Zero-Clause BSD"), "the licence is not the one package.json declares");
});

test("the vendored engine keeps its own licence and its provenance", () => {
  const vendored = join(ROOT, "vendor", "rust-law");
  assert.ok(existsSync(join(vendored, "LICENSE")), "somebody else's code without its licence");
  assert.ok(
    existsSync(join(vendored, "PROVENANCE.md")),
    "3,900 lines nobody here wrote and nothing saying where they came from",
  );
});

test("looper is still private, which is the one flag left to flip", () => {
  const held: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const asObject = held === null || typeof held !== "object" ? {} : held;
  assert.equal(
    Object.getOwnPropertyDescriptor(asObject, "license")?.value,
    "0BSD",
    "the licence field and the LICENSE file have to agree",
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(asObject, "private")?.value,
    true,
    "when this is deliberately made public, delete this test with the flag",
  );
});

test("the install line points at the repository this actually is", () => {
  const held: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const where = Object.getOwnPropertyDescriptor(held, "repository")?.value;
  const url = Object.getOwnPropertyDescriptor(where, "url")?.value;
  assert.equal(typeof url, "string");

  const slug = String(url).replace(/^git\+https:\/\/github\.com\//, "").replace(/\.git$/, "");
  for (const file of ["README.md", "CONTRIBUTING.md"]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    if (!text.includes("npm install")) continue;
    assert.ok(
      text.includes(`github:${slug}`),
      `${file} tells a stranger to install from somewhere that is not ${slug}. The first command in a README is the one that has to work.`,
    );
  }
});
