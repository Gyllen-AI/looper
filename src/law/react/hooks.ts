import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, isNode, type Node } from "../ts/parse.ts";
import { fieldAt } from "../../fields.ts";

export const CONDITIONAL_HOOK: Rule = {
  id: "REACT:1",
  category: "ERROR",
  pass: "fast",
  bans: "calling a hook inside an `if`, a loop, or after an early `return`",
  why:
    "React matches up your hooks by counting them, in order, every time it draws the screen. Put one behind a condition and the count changes between draws, so the value you asked for comes back as somebody else's. It shows up as a screen holding the wrong data, or as a crash that only happens on the second click, and nothing points at the line that caused it",
  instead: [
    "call every hook at the top, before any if or return, and put the condition inside it: useEffect(() => { if (!id) return; load(id) }, [id])",
    "if a whole branch needs different hooks, that is two components",
  ],
  valve: { kind: "none" },
};

const HOOK = /^use[A-Z]/;

const BRANCHING: readonly string[] = [
  "IfStatement",
  "ConditionalExpression",
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "LogicalExpression",
];

function hookNameOf(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = node["callee"];
  const type = fieldAt(callee, "type");
  if (type === "Identifier") {
    const name = fieldAt(callee, "name");
    return typeof name === "string" && HOOK.test(name) ? name : null;
  }
  if (type !== "MemberExpression") return null;
  const object = fieldAt(callee, "object");
  const property = fieldAt(callee, "property");
  if (object === null || typeof object !== "object") return null;
  if (property === null || typeof property !== "object") return null;
  if (fieldAt(object, "name") !== "React") return null;
  const name = fieldAt(property, "name");
  return typeof name === "string" && HOOK.test(name) ? name : null;
}

function hooksUnder(node: Node): readonly Finding[] {
  const found: Finding[] = [];
  walk(node, (held) => {
    if (hookNameOf(held) !== null) found.push({ line: lineOfNode(held) });
  });
  return found;
}

const FUNCTIONS: readonly string[] = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
];

function returnsWithin(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((held) => returnsWithin(held));
  const type = fieldAt(node, "type");
  if (typeof type === "string" && FUNCTIONS.includes(type)) return false;
  if (type === "ReturnStatement") return true;
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    if (returnsWithin(fieldAt(node, key))) return true;
  }
  return false;
}

function afterAnEarlyReturn(node: Node): readonly Finding[] {
  if (!FUNCTIONS.includes(node.type)) return [];
  const body = node["body"];
  const statements = fieldAt(body, "body");
  if (!Array.isArray(statements)) return [];

  const found: Finding[] = [];
  let passed = false;
  for (const [at, statement] of statements.entries()) {
    if (!isNode(statement)) continue;
    if (passed) found.push(...hooksUnder(statement));
    const last = at === statements.length - 1;
    if (!last && returnsWithin(statement)) passed = true;
  }
  return found;
}

export const conditionalHookCheck: Check = {
  rule: CONDITIONAL_HOOK,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    const seen = new Set<number>();

    walk(parsed.root, (node) => {
      const here = BRANCHING.includes(node.type)
        ? hooksUnder(node)
        : afterAnEarlyReturn(node);
      for (const finding of here) {
        if (seen.has(finding.line)) continue;
        seen.add(finding.line);
        found.push(finding);
      }
    });

    return found;
  },
};
