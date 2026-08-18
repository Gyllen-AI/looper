import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReport, leaksInShape, wordsIn, withoutComments } from "../src/report/write.ts";
import { render, shapeAt } from "../src/report/skeleton.ts";

const PRIVATE = `import { acmeBillingGateway } from "@acme/billing-internal";

export async function reconcileTenantLedger(tenantRef: string) {
  try {
    return await acmeBillingGateway.settle(tenantRef, "PROD-TENANT-8842");
  } catch (cause) {
    auditTrail.record(cause);
    return [];
  }
}
`;

const SECRETS: readonly string[] = [
  "acmeBillingGateway",
  "billing-internal",
  "reconcileTenantLedger",
  "tenantRef",
  "PROD-TENANT-8842",
  "auditTrail",
  "settle",
];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-report-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/billing.ts"), PRIVATE);
  return root;
}

test("the report carries the shape and nothing from the project", () => {
  const root = project();
  try {
    const written = buildReport({
      root,
      ruleId: "TS-ERROR:3",
      file: "src/billing.ts",
      line: 8,
      tried: "returning a named case broke the caller",
    });

    assert.equal(written.kind, "written");
    if (written.kind !== "written") return;
    for (const secret of SECRETS) {
      assert.ok(
        !written.body.includes(secret),
        `${secret} reached the report, which people will run on private repositories`,
      );
    }
    assert.ok(written.body.includes("ReturnStatement"));
    assert.ok(written.body.includes("TS-ERROR:3"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a leak through the free text refuses the whole report", () => {
  const root = project();
  try {
    const written = buildReport({
      root,
      ruleId: "TS-ERROR:3",
      file: "src/billing.ts",
      line: 8,
      tried: "I tried changing acmeBillingGateway.settle to throw",
    });

    assert.equal(written.kind, "would-leak");
    if (written.kind !== "would-leak") return;
    assert.ok(written.leaks.some((one) => one.word === "acmeBillingGateway"));
    assert.ok(!existsSync(join(root, ".looper/report.md")), "and nothing is written");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("names are anonymised in order, and values are removed entirely", () => {
  const found = shapeAt(
    "a.ts",
    'export function f() {\n  acmeClient.push(ref, "TENANT-8842");\n}\n',
    2,
    6,
  );
  assert.equal(found.kind, "found");
  if (found.kind !== "found") return;

  const drawn = render(found.shape, 0);
  assert.ok(drawn.includes("name1"));
  assert.ok(drawn.includes("value-removed"));
  assert.ok(!drawn.includes("acmeClient"));
  assert.ok(!drawn.includes("TENANT-8842"));
});

test("the same name twice gets the same placeholder, so the shape stays readable", () => {
  const found = shapeAt("a.ts", "export function f() {\n  a.b(a);\n}\n", 2, 6);
  assert.equal(found.kind, "found");
  if (found.kind !== "found") return;
  const drawn = render(found.shape, 0);
  assert.equal(drawn.split("name1").length - 1, 2);
});

test("a line with nothing on it is refused rather than guessed at", () => {
  const root = project();
  try {
    const written = buildReport({
      root,
      ruleId: "TS-ERROR:3",
      file: "src/billing.ts",
      line: 1000,
      tried: "nothing",
    });
    assert.equal(written.kind, "no-shape");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the shape may carry only words looper itself can write", () => {
  assert.deepEqual(
    [...leaksInShape("VariableDeclaration (kind=const)\n  VariableDeclarator\n    Identifier (name1)")],
    [],
    "a syntax kind, a structural key, a grammar word and a numbered stand-in are the whole vocabulary, and refusing them refuses every real file — which is what happened to every one of looper's own",
  );
  assert.deepEqual(
    [...leaksInShape("Identifier (settlementAccount)")].map((held) => held.word),
    ["settlementAccount"],
    "a name that reached the shape un-anonymised is the only thing this check exists to catch",
  );
  assert.ok(wordsIn("a.b(c)").has("a") === false, "one-letter names are not words");
});

test("the report says looper cannot send it, because it cannot", () => {
  const root = project();
  try {
    const written = buildReport({
      root,
      ruleId: "TS-ERROR:3",
      file: "src/billing.ts",
      line: 8,
      tried: "nothing worked",
    });
    assert.equal(written.kind, "written");
    if (written.kind !== "written") return;
    assert.ok(written.body.includes("Read it yourself before it goes anywhere"));
    assert.ok(written.body.includes("looper cannot send it"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a name from any other file in the project is caught too", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/config.ts"), "export const acmeTenantId = 1;\n");
    const written = buildReport({
      root,
      ruleId: "TS-ERROR:3",
      file: "src/billing.ts",
      line: 8,
      tried: "the caller acmeTenantId expects an array",
    });

    assert.equal(
      written.kind,
      "would-leak",
      "the check reads the whole project, not only the file the rule fired in",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a template literal's text does not survive into the shape", () => {
  const found = shapeAt(
    "a.ts",
    "export function f(id: string) {\n  const q = db.query(`SELECT * FROM acme_tenant_ledger WHERE r = ${id}`);\n}\n",
    2,
    8,
  );
  assert.equal(found.kind, "found");
  if (found.kind !== "found") return;
  assert.ok(!render(found.shape, 0).includes("acme_tenant_ledger"));
  assert.ok(render(found.shape, 0).includes("TemplateLiteral"));
});

const PRIVATE_RUST = `pub fn reconcile_tenant_ledger(tenant_ref: &str) -> u8 {
    let settled = acme_billing_gateway::settle(tenant_ref, "PROD-TENANT-8842");
    settled.len() as u8
}
`;

const RUST_SECRETS: readonly string[] = [
  "reconcile_tenant_ledger",
  "tenant_ref",
  "acme_billing_gateway",
  "settle",
  "PROD-TENANT-8842",
  "settled",
];

const PRIVATE_PYTHON = `def reconcile_tenant_ledger(tenant_ref):
    try:
        return acme_billing_gateway.settle(tenant_ref, "PROD-TENANT-8842")
    except OSError:
        return []
`;

function rustProject(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-report-rust-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "held"\nversion = "0.1.0"\nedition = "2021"\n');
  writeFileSync(join(root, "src/ledger.rs"), PRIVATE_RUST);
  return root;
}

test("a Rust file gets a report, because the Rust half is judged by rules that can be wrong too", () => {
  const root = rustProject();
  try {
    const written = buildReport({
      root,
      ruleId: "RUST-TYPE:4",
      file: "src/ledger.rs",
      line: 3,
      tried: "the token is a column type override, not a numeric cast",
    });

    assert.equal(
      written.kind,
      "written",
      `a Rust file could not be reported on: ${JSON.stringify(written)}. Twenty-nine Rust rules are judged at full strength and none of them could be argued with.`,
    );
    if (written.kind !== "written") return;
    for (const secret of RUST_SECRETS) {
      assert.ok(
        !written.body.includes(secret),
        `the report carries ${secret}, which is the adopter's code and the one thing this file promises never to hold`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Python file gets a report too, for the same reason", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-python-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/ledger.py"), PRIVATE_PYTHON);

    const written = buildReport({
      root,
      ruleId: "PY-ERROR:1",
      file: "src/ledger.py",
      line: 3,
      tried: "the failure is observed by the caller above",
    });

    assert.equal(written.kind, "written", `a Python file could not be reported on: ${JSON.stringify(written)}`);
    if (written.kind !== "written") return;
    for (const secret of ["reconcile_tenant_ledger", "tenant_ref", "acme_billing_gateway", "PROD-TENANT-8842"]) {
      assert.ok(!written.body.includes(secret), `the report carries ${secret}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a line with nothing on it is refused in Rust as well, rather than guessed at", () => {
  const root = rustProject();
  try {
    const written = buildReport({
      root,
      ruleId: "RUST-TYPE:4",
      file: "src/ledger.rs",
      line: 400,
      tried: "nothing is there",
    });

    assert.equal(written.kind, "no-shape");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const EVERY_PYTHON_SHAPE = `import acme_billing as gateway
from acme_ledger import settle


def reconcile(tenant_ref, *rest, **named):
    totals = [one.amount for one in rest if one.paid]
    with gateway.open(tenant_ref) as handle:
        try:
            return settle(handle, reason="PROD-TENANT-8842", totals=totals)
        except OSError as cause:
            raise RuntimeError("could not settle") from cause
`;

test("every Python construct that names its node in lower case still gets a report", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-python-nodes-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/every.py"), EVERY_PYTHON_SHAPE);

    for (const line of [1, 2, 5, 6, 7, 8, 9, 10, 11]) {
      const written = buildReport({
        root,
        ruleId: "PY-ERROR:1",
        file: "src/every.py",
        line,
        tried: "the sentence is checked and this one is plain",
      });

      assert.equal(
        written.kind,
        "written",
        `line ${line} could not be reported on: ${JSON.stringify(written)}. Python's ast names twenty of its node types in lower case — arg, alias, comprehension, withitem and the rest — and a name looper has not declared is read as a leak, which refuses the whole report.`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const SPREAD_OVER_LINES = `export function totals(rows: readonly Row[]): number {
  return rows
    .filter((row) => row.live)
    .map((row) => row.amount ?? 0)
    .reduce((a, b) => a + b, 0);
}
`;

test("a line that starts no statement is reported against the statement around it, not refused", () => {
  const located = shapeAt("src/totals.ts", SPREAD_OVER_LINES, 4, 6);

  assert.notEqual(
    located.kind,
    "not-found",
    "the one route open when a rule is wrong everywhere refuses a continuation line, which is an ordinary line and the exact place a wrong verdict lands",
  );
  assert.equal(located.kind, "around");
  if (located.kind !== "around") return;
  assert.equal(
    located.startsAt,
    2,
    "the report has to say where the statement actually begins, or the reader cannot tell what was judged",
  );
  assert.ok(render(located.shape, 0).includes("ReturnStatement"));
});

test("a line outside every statement is still said out loud rather than refused", () => {
  const located = shapeAt("src/totals.ts", SPREAD_OVER_LINES, 7, 6);

  assert.equal(
    located.kind,
    "not-found",
    "line 7 is the closing brace and belongs to no statement, which is the one honest refusal",
  );
});

const PYTHON_OVER_LINES = `def totals(rows):
    return sum(
        row["amount"]
        for row in rows
        if row["live"]
    )
`;

test("a Python line that starts no statement is reported against the statement around it", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-python-around-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/totals.py"), PYTHON_OVER_LINES);

    const written = buildReport({
      root,
      ruleId: "PY-TRUTH:1",
      file: "src/totals.py",
      line: 4,
      tried: "the rule named a line that begins nothing",
    });

    assert.equal(
      written.kind,
      "written",
      `the Python half refuses a continuation line, so two thirds of the escape hatch closes again: ${JSON.stringify(written)}`,
    );
    if (written.kind !== "written") return;
    assert.ok(
      written.body.includes("starts no statement"),
      "the report has to say the line began nothing, or the reader cannot tell what was judged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a word that only appears in a comment is not a name from the code", () => {
  assert.equal(
    withoutComments("src/note.py", "# THE BUCKET IS THE TRUTH about it\nx = 1\n").includes("TRUTH"),
    false,
    "an ordinary English word somebody wrote in a comment becomes a word nobody may use when arguing with a rule",
  );
  assert.equal(
    withoutComments("src/one.ts", "// the CACHE_KEY is stale\nconst CACHE_KEY = 1;\n").includes("CACHE_KEY"),
    true,
    "the name is still declared in the code, so it stays in the corpus",
  );
  assert.equal(
    withoutComments("src/one.ts", 'const marker = "# not a comment";\n').includes("not"),
    true,
    "a comment marker inside a string is not a comment",
  );
  assert.equal(
    withoutComments("src/one.ts", "/* SWEPT away */\nconst kept = 1;\n").includes("SWEPT"),
    false,
  );
});

test("arguing with a rule may use the rule's own name", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-ruleid-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/one.ts"), "export const n = rows.get(k) ?? 0;\n");
    writeFileSync(join(root, "src/note.py"), "# THE BUCKET IS THE TRUTH about it\nx = 1\n");

    const written = buildReport({
      root,
      ruleId: "TS-TRUTH:1",
      file: "src/one.ts",
      line: 1,
      tried: "The gate named a line where TRUTH does not apply.",
    });

    assert.equal(
      written.kind,
      "written",
      `the one word the sentence cannot avoid is the rule's own name, and it is already printed in the report: ${JSON.stringify(written)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const RUST_OVER_LINES = `pub fn totals(rows: &[Row]) -> u64 {
    let live = rows.iter().filter(|row| row.live);

    live.map(|row| row.amount).sum()
}
`;

test("a Rust line that starts nothing is reported against the item around it", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-report-rust-around-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "held"\nversion = "0.1.0"\nedition = "2021"\n');
    writeFileSync(join(root, "src/totals.rs"), RUST_OVER_LINES);

    const written = buildReport({
      root,
      ruleId: "RUST-TYPE:4",
      file: "src/totals.rs",
      line: 3,
      tried: "the rule named a line that begins nothing",
    });

    assert.equal(
      written.kind,
      "written",
      `the Rust half refuses a continuation line, so one of three languages still cannot argue with a rule: ${JSON.stringify(written)}`,
    );
    if (written.kind !== "written") return;
    assert.ok(
      written.body.includes("starts no statement"),
      "the report has to say the line began nothing, or the reader cannot tell what was judged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
