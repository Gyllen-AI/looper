import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../ts/parse.ts";
import { isCallTo } from "../ts/nodes.ts";
import { fieldAt } from "../../fields.ts";
import { anyTraced, valuesBoundIn, type Bindings } from "../ts/bindings.ts";

export const BUILT_QUERY: Rule = {
  id: "DATA:1",
  onlyFor: "backend",
  category: "SECURITY",
  pass: "fast",
  bans: "building a database query by pasting values into the text of it",
  why:
    "whatever the value contains becomes part of the instruction. Someone typing the right thing into a search box can read your whole database, or empty it. This is the single most exploited mistake in software and it has been for twenty-five years. Your database can already do this safely, and the safe way is shorter to write",
  instead: [
    "db.query('SELECT * FROM orders WHERE id = $1', [id])",
    "sql`SELECT * FROM orders WHERE id = ${id}` — a tagged template is safe, because the library handles the value separately",
    "with Drizzle: db.select().from(orders).where(eq(orders.id, id))",
  ],
  valve: { kind: "none" },
};

const QUERYING: readonly string[] = [
  "query",
  "execute",
  "raw",
  "unsafe",
  "exec",
  "run",
  "all",
  "get",
];

function looksLikeSql(text: string): boolean {
  return /\b(select|insert|update|delete|drop|from|where)\b/i.test(text);
}

function templateText(node: unknown): string {
  if (node === null || typeof node !== "object") return "";
  const quasis = fieldAt(node, "quasis");
  if (!Array.isArray(quasis)) return "";
  return quasis
    .map((held) => {
      if (held === null || typeof held !== "object") return "";
      const value = fieldAt(held, "value");
      if (value === null || typeof value !== "object") return "";
      const raw = fieldAt(value, "raw");
      return typeof raw === "string" ? raw : "";
    })
    .join(" ");
}

function pastedInto(argument: unknown): boolean {
  const type = fieldAt(argument, "type");

  if (type === "TemplateLiteral") {
    const expressions = fieldAt(argument, "expressions");
    if (!Array.isArray(expressions) || expressions.length === 0) return false;
    return looksLikeSql(templateText(argument));
  }

  if (type !== "BinaryExpression") return false;
  if (fieldAt(argument, "operator") !== "+") return false;
  let sql = false;
  walk(argument, (held) => {
    if (held.type !== "StringLiteral") return;
    const value = held["value"];
    if (typeof value === "string" && looksLikeSql(value)) sql = true;
  });
  return sql;
}

export const builtQueryCheck: Check = {
  rule: BUILT_QUERY,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const bindings: Bindings = valuesBoundIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (!isCallTo(node, QUERYING)) return;
      const args = node["arguments"];
      if (!Array.isArray(args)) return;
      const pasted = args.some((argument) => anyTraced(argument, bindings, pastedInto));
      if (pasted) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
