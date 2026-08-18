import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { isNode, lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { bindingsIn, provenanceOf, rootOfMember, type Bindings } from "./scope.ts";
import { fieldAt } from "../../fields.ts";

export const VANISHED_ERROR: Rule = {
  id: "TS-ERROR:4",
  category: "ERROR",
  pass: "fast",
  bans:
    "catching an error and doing nothing with it — an empty `catch {}`, or a catch that never looks at what it caught",
  why:
    "a failure nobody hears about is a bug that gets reported months later as 'it was just slow that week'. There are three ways out of a catch and no fourth: throw it on, hand it to the caller, or log it and recover in the open",
  instead: [
    "catch (cause) { throw new CouldNotRead(path, cause) }",
    "catch (cause) { return { kind: 'unreadable', detail: String(cause) } }",
    "catch (cause) { logger.warn({ cause }, 'cache unreadable, counting again'); return count(source) }",
  ],
  valve: {
    kind: "knob",
    key: "[ts] trace_symbols",
    note: "the logging calls that count as writing it down; name your own logger's, never remove the requirement",
  },
};

function caughtName(node: Node): string | null {
  const param = node["param"];
  const type = fieldAt(param, "type");
  if (type !== "Identifier") return null;
  const name = fieldAt(param, "name");
  return typeof name === "string" ? name : null;
}

const PURE_CONVERSIONS: readonly string[] = ["String", "Number", "Boolean"];

function mentions(value: unknown, carrying: ReadonlySet<string>): boolean {
  let found = false;
  if (value === null || typeof value !== "object") return false;
  walk(value, (node) => {
    if (node.type !== "Identifier") return;
    const name = fieldAt(node, "name");
    if (typeof name === "string" && carrying.has(name)) found = true;
  });
  return found;
}

function convertsOnly(callee: unknown): boolean {
  const name = fieldAt(callee, "name");
  if (typeof name === "string" && PURE_CONVERSIONS.includes(name)) return true;
  const property = fieldAt(fieldAt(callee, "property"), "name");
  if (property === "toString") return true;
  if (property !== "stringify") return false;
  return fieldAt(fieldAt(callee, "object"), "name") === "JSON";
}

function carriedNames(body: Node, caught: string): ReadonlySet<string> {
  const carrying = new Set<string>([caught]);
  let grew = true;
  while (grew) {
    grew = false;
    walk(body, (node) => {
      if (node.type !== "VariableDeclarator" && node.type !== "AssignmentExpression") return;
      const held = node.type === "VariableDeclarator" ? node["init"] : node["right"];
      if (!mentions(held, carrying)) return;
      const target = node.type === "VariableDeclarator" ? node["id"] : node["left"];
      const name = fieldAt(target, "name");
      if (typeof name !== "string" || carrying.has(name)) return;
      carrying.add(name);
      grew = true;
    });
  }
  return carrying;
}

function declaredWithin(body: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(body, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const name = fieldAt(node["id"], "name");
    if (typeof name === "string") found.add(name);
  });
  return found;
}

function decidesSomething(node: Node, carrying: ReadonlySet<string>): boolean {
  if (node.type === "IfStatement" || node.type === "ConditionalExpression") {
    return mentions(node["test"], carrying);
  }
  if (node.type !== "SwitchStatement") return false;
  return mentions(node["discriminant"], carrying);
}

function leavesTheBlock(node: Node, carrying: ReadonlySet<string>, own: ReadonlySet<string>): boolean {
  if (node.type !== "AssignmentExpression") return false;
  if (!mentions(node["right"], carrying)) return false;
  const name = fieldAt(node["left"], "name");
  return typeof name !== "string" || !own.has(name);
}

function escapesFrom(body: Node, caught: string): boolean {
  const carrying = carriedNames(body, caught);
  const own = declaredWithin(body);
  let found = false;
  walk(body, (node) => {
    if (node.type === "ThrowStatement" || node.type === "ReturnStatement") {
      if (mentions(node["argument"], carrying)) found = true;
      return;
    }
    if (decidesSomething(node, carrying)) {
      found = true;
      return;
    }
    if (leavesTheBlock(node, carrying, own)) {
      found = true;
      return;
    }
    if (node.type !== "CallExpression") return;
    if (convertsOnly(node["callee"])) return;
    if (mentions(node["arguments"], carrying)) found = true;
  });
  return found;
}

function observesWithin(
  body: Node,
  bindings: Bindings,
  blessed: readonly string[],
): boolean {
  let found = false;
  walk(body, (node) => {
    if (node.type !== "CallExpression") return;
    const member = rootOfMember(node);
    if (member.kind !== "named") return;
    if (!blessed.includes(member.symbol)) return;
    const root = member.symbol.slice(0, member.symbol.indexOf("."));
    if (provenanceOf(bindings, root).kind === "genuine") found = true;
  });
  return found;
}

export const vanishedErrorCheck: Check = {
  rule: VANISHED_ERROR,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const bindings = bindingsIn(parsed.root);
    const found: Finding[] = [];

    walk(parsed.root, (node) => {
      if (node.type !== "CatchClause") return;
      const body = node["body"];
      if (!isNode(body)) return;
      if (observesWithin(body, bindings, concessions.traceSymbols)) return;
      const caught = caughtName(node);
      if (caught !== null && escapesFrom(body, caught)) return;
      found.push({ line: lineOfNode(node) });
    });

    return found;
  },
};
