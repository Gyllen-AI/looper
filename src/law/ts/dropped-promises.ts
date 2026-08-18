import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, isNode, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const DROPPED_PROMISES: Rule = {
  id: "TS-ERROR:6",
  category: "ERROR",
  pass: "fast",
  bans:
    "giving `forEach` something that takes time to finish, and throwing away what `map` handed back when it does",
  why:
    "forEach throws away whatever its function returns, so every one of those jobs is started and none is waited for. The loop finishes instantly, the work is still running, and if any of it fails nobody ever finds out. This one is always a bug",
  instead: [
    "for (const order of orders) { await send(order) }",
    "await Promise.all(orders.map((order) => send(order)))",
  ],
  valve: { kind: "none" },
};

const FORGETFUL: readonly string[] = ["forEach"];

const ONLY_IF_DISCARDED: readonly string[] = ["map", "filter"];

function isAsyncFunction(value: unknown): boolean {
  const type = fieldAt(value, "type");
  if (type !== "ArrowFunctionExpression" && type !== "FunctionExpression") return false;
  return fieldAt(value, "async") === true;
}

function calledMethod(node: Node): string | null {
  const callee = node["callee"];
  if (fieldAt(callee, "type") !== "MemberExpression") {
    return null;
  }
  const property = fieldAt(callee, "property");
  const name = fieldAt(property, "name");
  return typeof name === "string" ? name : null;
}

function asyncNamesIn(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (node.type === "FunctionDeclaration" && fieldAt(node, "async") === true) {
      const name = fieldAt(node["id"], "name");
      if (typeof name === "string") found.add(name);
      return;
    }
    if (node.type !== "VariableDeclarator") return;
    if (!isAsyncFunction(node["init"])) return;
    const name = fieldAt(node["id"], "name");
    if (typeof name === "string") found.add(name);
  });
  return found;
}

function handsBackAPromise(value: unknown, waiting: ReadonlySet<string>): boolean {
  const type = fieldAt(value, "type");
  if (type === "Identifier") {
    const name = fieldAt(value, "name");
    return typeof name === "string" && waiting.has(name);
  }
  if (type !== "ArrowFunctionExpression" && type !== "FunctionExpression") return false;
  const body = fieldAt(value, "body");
  if (fieldAt(body, "type") === "CallExpression") {
    return handsBackAPromise(fieldAt(body, "callee"), waiting);
  }
  let found = false;
  if (body === null || typeof body !== "object") return false;
  walk(body, (held) => {
    if (held.type !== "ReturnStatement") return;
    const argument = held["argument"];
    if (fieldAt(argument, "type") !== "CallExpression") return;
    if (handsBackAPromise(fieldAt(argument, "callee"), waiting)) found = true;
  });
  return found;
}

function discardedCalls(root: Node): ReadonlySet<Node> {
  const found = new Set<Node>();
  walk(root, (node) => {
    if (node.type !== "ExpressionStatement") return;
    let held = node["expression"];
    if (fieldAt(held, "type") === "AwaitExpression") held = fieldAt(held, "argument");
    if (!isNode(held)) return;
    if (held.type === "CallExpression") found.add(held);
  });
  return found;
}

export const droppedPromisesCheck: Check = {
  rule: DROPPED_PROMISES,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const waiting = asyncNamesIn(parsed.root);
    const discarded = discardedCalls(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type !== "CallExpression") return;
      const method = calledMethod(node);
      if (method === null) return;
      const forgetful =
        FORGETFUL.includes(method) ||
        (ONLY_IF_DISCARDED.includes(method) && discarded.has(node));
      if (!forgetful) return;
      const args = node["arguments"];
      if (!Array.isArray(args)) return;
      const given = args.some(
        (argument) => isAsyncFunction(argument) || handsBackAPromise(argument, waiting),
      );
      if (given) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
