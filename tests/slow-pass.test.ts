import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { judge } from "../src/law/engine.ts";
import { disposeWorkCheck } from "../src/law/ts/dispose.ts";
import { floatingPromiseCheck } from "../src/law/ts/floating-promise.ts";
import { resolveLocal } from "../src/law/ts/module-graph.ts";
import { readFileSync } from "node:fs";

const ASYNC_MODULE = `export async function save(order: string) {
  return db.put(order);
}

export function total(amount: number) {
  return amount;
}
`;

function project(caller: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-slow-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/db.ts"), ASYNC_MODULE);
  writeFileSync(join(root, "src/orders.ts"), caller);
  return root;
}

function linesFlagged(root: string): readonly number[] {
  const path = join(root, "src/orders.ts");
  return judge(
    [floatingPromiseCheck],
    "slow",
    { file: path, text: readFileSync(path, "utf8") },
    CONCEDING_NOTHING,
  ).violations.map((held) => held.line);
}

test("work started in another file and never waited for is caught", () => {
  const root = project('import { save } from "./db.ts";\n\nexport async function place(o: string) {\n  save(o);\n}\n');
  try {
    assert.deepEqual([...linesFlagged(root)], [4]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("awaiting it is the point, and passes", () => {
  const root = project('import { save } from "./db.ts";\n\nexport async function place(o: string) {\n  await save(o);\n}\n');
  try {
    assert.deepEqual([...linesFlagged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("saying what happens if it fails also passes", () => {
  const root = project(
    'import { save } from "./db.ts";\n\nexport function place(o: string) {\n  save(o).catch((cause) => logger.error({ cause }));\n}\n',
  );
  try {
    assert.deepEqual([...linesFlagged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ordinary function from the same file is not work that takes time", () => {
  const root = project('import { total } from "./db.ts";\n\nexport function sum() {\n  total(1);\n}\n');
  try {
    assert.deepEqual([...linesFlagged(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("it follows a rename at the import", () => {
  const root = project(
    'import { save as store } from "./db.ts";\n\nexport function place(o: string) {\n  store(o);\n}\n',
  );
  try {
    assert.deepEqual([...linesFlagged(root)], [4]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("something declared in the same file is caught without leaving it", () => {
  const root = project(
    'async function send(o: string) { return post(o); }\n\nexport function place(o: string) {\n  send(o);\n}\n',
  );
  try {
    assert.deepEqual([...linesFlagged(root)], [4]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an async arrow held in a const counts too", () => {
  const root = project(
    'const send = async (o: string) => post(o);\n\nexport function place(o: string) {\n  send(o);\n}\n',
  );
  try {
    assert.deepEqual([...linesFlagged(root)], [4]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("this rule never runs on the fast pass, because it has to read other files", () => {
  const root = project('import { save } from "./db.ts";\n\nexport function place(o: string) {\n  save(o);\n}\n');
  try {
    const path = join(root, "src/orders.ts");
    const fast = judge(
      [floatingPromiseCheck],
      "fast",
      { file: path, text: readFileSync(path, "utf8") },
      CONCEDING_NOTHING,
    );
    assert.deepEqual([...fast.violations], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a package is not ours to resolve, and is left alone rather than guessed at", () => {
  assert.equal(resolveLocal("/a/b/c.ts", "zod").kind, "not-ours");
  assert.equal(resolveLocal("/a/b/c.ts", "node:fs").kind, "not-ours");
  assert.equal(resolveLocal("/a/b/c.ts", "./nowhere.ts").kind, "missing");
});

function withPackage(caller: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-pkg-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules/mailer"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app" }));
  writeFileSync(
    join(root, "node_modules/mailer/package.json"),
    JSON.stringify({ name: "mailer", types: "index.d.ts" }),
  );
  writeFileSync(
    join(root, "node_modules/mailer/index.d.ts"),
    "export declare function send(to: string): Promise<void>;\nexport declare function format(t: string): string;\n",
  );
  writeFileSync(join(root, "src/orders.ts"), caller);
  return root;
}

function flaggedIn(root: string): readonly number[] {
  const path = join(root, "src/orders.ts");
  return judge(
    [floatingPromiseCheck],
    "slow",
    { file: path, text: readFileSync(path, "utf8") },
    { ...CONCEDING_NOTHING, projectRoot: root },
  ).violations.map((held) => held.line);
}

test("work from an installed package is caught, by reading what it declares", () => {
  const root = withPackage('import { send } from "mailer";\n\nexport function confirm(to: string) {\n  send(to);\n}\n');
  try {
    assert.deepEqual([...flaggedIn(root)], [4]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a package function that finishes immediately is left alone", () => {
  const root = withPackage('import { format } from "mailer";\n\nexport function confirm(to: string) {\n  format(to);\n}\n');
  try {
    assert.deepEqual([...flaggedIn(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a package that declares no types is passed over, never guessed at", () => {
  const root = withPackage('import { send } from "unknowable";\n\nexport function confirm(to: string) {\n  send(to);\n}\n');
  try {
    assert.deepEqual([...flaggedIn(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reading a declaration runs nothing: a .d.ts holds no code to run", () => {
  const root = withPackage('import { send } from "mailer";\n\nexport function confirm(to: string) {\n  await send(to);\n}\n');
  try {
    const declaration = readFileSync(join(root, "node_modules/mailer/index.d.ts"), "utf8");
    assert.ok(declaration.includes("declare"));
    assert.ok(!declaration.includes("require("));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("work started in a plain dispose has nowhere to report to", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-dispose-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(
      join(root, "src/pool.ts"),
      `async function close(h: string) { return h; }

export class Connection {
  [Symbol.dispose]() {
    close("x");
  }
}
`,
    );
    const path = join(root, "src/pool.ts");
    const found = judge(
      [disposeWorkCheck],
      "slow",
      { file: path, text: readFileSync(path, "utf8") },
      { ...CONCEDING_NOTHING, projectRoot: root },
    ).violations;

    assert.equal(found.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("asyncDispose can wait, so it is left alone", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-adispose-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(
      join(root, "src/pool.ts"),
      `async function close(h: string) { return h; }

export class Connection {
  async [Symbol.asyncDispose]() {
    await close("x");
  }
}
`,
    );
    const path = join(root, "src/pool.ts");
    assert.deepEqual(
      [
        ...judge(
          [disposeWorkCheck],
          "slow",
          { file: path, text: readFileSync(path, "utf8") },
          { ...CONCEDING_NOTHING, projectRoot: root },
        ).violations,
      ],
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
