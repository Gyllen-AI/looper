import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReport, leaksInShape, wordsIn } from "../src/report/write.ts";
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
