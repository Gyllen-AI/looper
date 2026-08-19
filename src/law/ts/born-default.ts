import type { Concessions } from "../concessions.ts";
import { isNamed } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, isNode, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const BORN_DEFAULT: Rule = {
  id: "TS-TRUTH:1",
  category: "TRUTH",
  pass: "fast",
  bans:
    "a value standing in for one nobody gave: `??`, `||` used as a value, `??=`, `||=`, a default parameter, a destructuring default, `if (!x) x = 5`, and **any object literal spreading two or more things** — everywhere but the one file that gathers settings. That last one is wider than the harm: looper cannot tell `{ ...DEFAULTS, ...given }` from `{ ...current, ...patch }`, so the copy-and-patch idiom fires too",
  why:
    "two places answering \"what happens when nobody said\" means the answer is whichever one ran last, and neither place knows about the other. Scattered, nobody can say what the program does when a value is missing, and the one who finds out is whoever is using it. The value that was never given is also the one nobody tested",
  instead: [
    "read it, then say what happens when it is not there: const held = counts.get(id); if (held === undefined) throw new NoCount(id)",
    "if absence is a real answer, name it where the reader can see: const n = held === undefined ? 0 : held",
    "settings take their defaults in the one file that gathers them, and are passed down from there",
  ],
  valve: {
    kind: "knob",
    key: "[ts] sanctum",
    note: "the one file where a missing value may become a default; defaults to config.ts. Move it if yours is named otherwise — never widen it to two",
  },
};

const TESTED: readonly string[] = [
  "IfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "ConditionalExpression",
];

const ALWAYS_A_DEFAULT = "??";

const SOMETIMES_A_DEFAULT = "||";

const A_FALLBACK_VALUE: readonly string[] = [
  "StringLiteral",
  "NumericLiteral",
  "BooleanLiteral",
  "NullLiteral",
  "TemplateLiteral",
  "Identifier",
  "MemberExpression",
  "OptionalMemberExpression",
  "ArrayExpression",
  "ObjectExpression",
  "NewExpression",
];

function withoutAssertion(value: unknown): unknown {
  const type = fieldAt(value, "type");
  if (type !== "TSAsExpression" && type !== "TSNonNullExpression") return value;
  return withoutAssertion(fieldAt(value, "expression"));
}

function isFallbackValue(value: unknown): boolean {
  const type = fieldAt(withoutAssertion(value), "type");
  return typeof type === "string" && A_FALLBACK_VALUE.includes(type);
}

function bearsADefault(node: Node): boolean {
  const operator = node["operator"];
  if (operator === ALWAYS_A_DEFAULT) return true;
  if (operator !== SOMETIMES_A_DEFAULT) return false;
  return isFallbackValue(node["right"]);
}

const DEFAULTING_ASSIGNMENT: readonly string[] = ["??=", "||="];

function markTests(root: Node): ReadonlySet<Node> {
  const asked = new Set<Node>();
  const take = (value: unknown): void => {
    if (!isNode(value)) return;
    asked.add(value);
    if (value.type !== "LogicalExpression" && value.type !== "UnaryExpression") return;
    take(value["left"]);
    take(value["right"]);
    take(value["argument"]);
  };
  walk(root, (node) => {
    if (TESTED.includes(node.type)) take(node["test"]);
    if (node.type === "ForStatement") take(node["test"]);
  });
  return asked;
}

function isLongHandDefault(node: Node): boolean {
  if (node.type !== "IfStatement") return false;
  const test = node["test"];
  if (fieldAt(test, "type") !== "UnaryExpression") return false;
  if (fieldAt(test, "operator") !== "!") return false;
  const guarded = fieldAt(test, "argument");
  if (fieldAt(guarded, "type") !== "Identifier") return false;
  const wanted = fieldAt(guarded, "name");

  let assigns = false;
  walk(node["consequent"], (held) => {
    if (held.type !== "AssignmentExpression") return;
    if (fieldAt(held["left"], "name") === wanted) assigns = true;
  });
  return assigns;
}

function isDefaultsMerge(node: Node): boolean {
  if (node.type !== "ObjectExpression") return false;
  const properties = node["properties"];
  if (!Array.isArray(properties)) return false;
  const spreads = properties.filter((held) => fieldAt(held, "type") === "SpreadElement");
  return spreads.length >= 2;
}

export const bornDefaultCheck: Check = {
  rule: BORN_DEFAULT,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (isNamed(subject.file, [concessions.sanctum])) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const asked = markTests(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type === "LogicalExpression") {
        if (asked.has(node) || !bearsADefault(node)) return;
        found.push({ line: lineOfNode(node) });
        return;
      }
      if (node.type === "AssignmentExpression") {
        const operator = node["operator"];
        if (typeof operator === "string" && DEFAULTING_ASSIGNMENT.includes(operator)) {
          found.push({ line: lineOfNode(node) });
        }
        return;
      }
      if (node.type === "AssignmentPattern" || isLongHandDefault(node) || isDefaultsMerge(node)) {
        found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};
