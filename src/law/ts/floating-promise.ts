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
  bans: "calling something that takes time to finish and not waiting for it",
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

function droppedCallName(node: Node): string | null {
  if (node.type !== "ExpressionStatement") return null;
  const expression = node["expression"];
  if (fieldAt(expression, "type") !== "CallExpression") {
    return null;
  }
  const callee = fieldAt(expression, "callee");
  if (fieldAt(callee, "type") !== "Identifier") {
    return null;
  }
  const name = fieldAt(callee, "name");
  return typeof name === "string" ? name : null;
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
      if (called !== null && waits.has(called)) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
