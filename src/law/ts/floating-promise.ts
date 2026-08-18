import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import {
  asyncExportsOf,
  asyncNamesIn,
  declarationsFor,
  promisingExportsOf,
  resolveLocal,
} from "./module-graph.ts";
import { fieldAt } from "../../fields.ts";

export const FLOATING_PROMISE: Rule = {
  id: "TS-ERROR:1",
  category: "ERROR",
  pass: "slow",
  bans:
    "calling something that takes time to finish and not waiting for it, including giving it a name that nothing then uses",
  why:
    "the program carries straight on while the job is still running. If it fails, nothing catches it and nobody is told — the save that did not happen, the email that never went. This is the most common way work is silently lost in this language, and it looks completely normal on the page",
  instead: [
    "await save(order)",
    "await Promise.all(orders.map((order) => save(order)))",
    "if you genuinely do not want to wait, say what happens when it fails: save(order).catch((cause) => logger.error({ cause }))",
  ],
  valve: { kind: "none" },
};

export function waitedNamesAt(root: string, file: string, specifier: string): ReadonlySet<string> {
  const local = resolveLocal(file, specifier);
  if (local.kind === "file") return asyncExportsOf(local.path);
  if (local.kind === "missing") return new Set();

  const declared = declarationsFor(root, specifier);
  if (declared.kind === "none") return new Set();
  return promisingExportsOf(declared.path);
}

export function importedAsyncNames(root: string, file: string, tree: Node): ReadonlySet<string> {
  const found = new Set<string>();

  walk(tree, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const source = node["source"];
    if (source === null || typeof source !== "object") return;
    const specifier = fieldAt(source, "value");
    if (typeof specifier !== "string") return;

    const asyncThere = waitedNamesAt(root, file, specifier);
    if (asyncThere.size === 0) return;

    const specifiers = node["specifiers"];
    if (!Array.isArray(specifiers)) return;
    for (const one of specifiers) {
      if (one === null || typeof one !== "object") continue;
      if (fieldAt(one, "type") !== "ImportSpecifier") {
        continue;
      }
      const imported = fieldAt(one, "imported");
      const local = fieldAt(one, "local");
      if (imported === null || typeof imported !== "object") continue;
      const name = fieldAt(imported, "name");
      if (typeof name !== "string" || !asyncThere.has(name)) continue;
      const under =
        local === null || typeof local !== "object"
          ? name
          : fieldAt(local, "name");
      found.add(typeof under === "string" ? under : name);
    }
  });

  return found;
}

const HANDLES_FAILURE = "catch";

const CONTINUES = "then";

function calledName(expression: unknown): string | null {
  if (fieldAt(expression, "type") !== "CallExpression") return null;
  const callee = fieldAt(expression, "callee");
  if (fieldAt(callee, "type") !== "Identifier") return null;
  const name = fieldAt(callee, "name");
  return typeof name === "string" ? name : null;
}

function methodOn(expression: unknown): { readonly named: string; readonly on: unknown } | null {
  if (fieldAt(expression, "type") !== "CallExpression") return null;
  const callee = fieldAt(expression, "callee");
  if (fieldAt(callee, "type") !== "MemberExpression") return null;
  const named = fieldAt(fieldAt(callee, "property"), "name");
  if (typeof named !== "string") return null;
  return { named, on: fieldAt(callee, "object") };
}

function saysWhatHappensOnFailure(expression: unknown): boolean {
  const held = methodOn(expression);
  if (held === null) return false;
  if (held.named === HANDLES_FAILURE) return true;
  if (held.named === CONTINUES) {
    const args = fieldAt(expression, "arguments");
    if (Array.isArray(args) && args.length > 1) return true;
  }
  return saysWhatHappensOnFailure(held.on);
}

function startedBy(expression: unknown): string | null {
  const direct = calledName(expression);
  if (direct !== null) return direct;
  const held = methodOn(expression);
  return held === null ? null : startedBy(held.on);
}

function beneathVoid(expression: unknown): unknown {
  const thrownAway =
    fieldAt(expression, "type") === "UnaryExpression" && fieldAt(expression, "operator") === "void";
  return thrownAway ? fieldAt(expression, "argument") : expression;
}

function droppedCallName(node: Node): string | null {
  if (node.type !== "ExpressionStatement") return null;
  const expression = beneathVoid(node["expression"]);
  if (saysWhatHappensOnFailure(expression)) return null;
  return startedBy(expression);
}

type Named = { readonly name: string; readonly called: string; readonly node: Node };

function promiseGivenAName(node: Node): Named | null {
  if (node.type !== "VariableDeclarator") return null;
  const id = node["id"];
  if (fieldAt(id, "type") !== "Identifier") return null;
  const name = fieldAt(id, "name");
  if (typeof name !== "string") return null;

  const init = node["init"];
  if (fieldAt(init, "type") !== "CallExpression") return null;
  const callee = fieldAt(init, "callee");
  if (fieldAt(callee, "type") !== "Identifier") return null;
  const called = fieldAt(callee, "name");
  if (typeof called !== "string") return null;

  return { name, called, node };
}

function timesMentioned(root: Node, name: string): number {
  let seen = 0;
  walk(root, (node) => {
    if (node.type !== "Identifier") return;
    if (fieldAt(node, "name") === name) seen += 1;
  });
  return seen;
}

export const floatingPromiseCheck: Check = {
  rule: FLOATING_PROMISE,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const waits = new Set<string>([
      ...asyncNamesIn(parsed.root),
      ...importedAsyncNames(concessions.projectRoot, subject.file, parsed.root),
    ]);
    if (waits.size === 0) return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      const called = droppedCallName(node);
      if (called !== null && waits.has(called)) {
        found.push({ line: lineOfNode(node) });
        return;
      }
      const named = promiseGivenAName(node);
      if (named === null || !waits.has(named.called)) return;
      if (timesMentioned(parsed.root, named.name) > 1) return;
      found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
