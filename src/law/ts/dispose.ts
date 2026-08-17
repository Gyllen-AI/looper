import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { importedAsyncNames } from "./floating-promise.ts";
import { asyncNamesIn } from "./module-graph.ts";
import { fieldAt } from "../../fields.ts";

export const DISPOSE_WORK: Rule = {
  id: "TS-ERROR:7",
  category: "ERROR",
  pass: "slow",
  bans: "starting work that takes time inside a plain `[Symbol.dispose]()`",
  why:
    "clean-up that runs on the way out has nowhere to report to. A plain dispose cannot wait, so the connection you asked it to close is still closing after everything has moved on, and if closing fails there is no caller left to tell. The failure is swallowed by the shape of the thing, not by anyone's mistake",
  instead: [
    "use [Symbol.asyncDispose]() and `await using`, so the waiting is real",
    "close it explicitly where someone can still handle the failure: await connection.close()",
    "keep dispose for the release that cannot fail",
  ],
  valve: { kind: "none" },
};

const SYNC_DISPOSE = "dispose";

function isSyncDisposeMethod(node: Node): boolean {
  if (node.type !== "ClassMethod" && node.type !== "ObjectMethod") return false;
  if (node["computed"] !== true) return false;
  if (node["async"] === true) return false;

  const key = node["key"];
  if (fieldAt(key, "type") !== "MemberExpression") {
    return false;
  }
  const object = fieldAt(key, "object");
  const property = fieldAt(key, "property");
  if (object === null || typeof object !== "object") return false;
  if (property === null || typeof property !== "object") return false;
  if (fieldAt(object, "name") !== "Symbol") return false;
  return fieldAt(property, "name") === SYNC_DISPOSE;
}

function calledNames(body: Node): readonly string[] {
  const names: string[] = [];
  walk(body, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node["callee"];
    const kind = fieldAt(callee, "type");
    if (kind === "Identifier") {
      const name = fieldAt(callee, "name");
      if (typeof name === "string") names.push(name);
      return;
    }
    if (kind !== "MemberExpression") return;
    const name = fieldAt(fieldAt(callee, "property"), "name");
    if (typeof name === "string") names.push(name);
  });
  return names;
}

function asyncMethodNames(root: Node): readonly string[] {
  const names: string[] = [];
  walk(root, (node) => {
    if (node.type !== "ClassMethod" && node.type !== "ObjectMethod") return;
    if (fieldAt(node, "async") !== true) return;
    const name = fieldAt(node["key"], "name");
    if (typeof name === "string") names.push(name);
  });
  return names;
}

export const disposeWorkCheck: Check = {
  rule: DISPOSE_WORK,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (!subject.text.includes(SYNC_DISPOSE)) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const waits = new Set<string>([
      ...asyncMethodNames(parsed.root),
      ...asyncNamesIn(parsed.root),
      ...importedAsyncNames(concessions.projectRoot, subject.file, parsed.root),
    ]);
    if (waits.size === 0) return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (!isSyncDisposeMethod(node)) return;
      const body = node["body"];
      if (body === null || typeof body !== "object") return;
      if (calledNames(body).some((name) => waits.has(name))) {
        found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};
