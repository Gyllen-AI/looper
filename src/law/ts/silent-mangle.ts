import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { isCallTo } from "./nodes.ts";
import { fieldAt } from "../../fields.ts";

export const SILENT_MANGLE: Rule = {
  id: "TS-TYPE:5",
  category: "TYPE",
  pass: "fast",
  bans:
    "`~~value`, a bitwise `| 0` or shift by zero, and `parseInt` without saying which number base",
  why:
    "each of these quietly changes a number rather than saying it cannot. A price of 10.99 becomes 10, a number too large becomes something else entirely, and a string that was never a number becomes NaN which then spreads through every sum it touches. Nothing anywhere says it happened",
  instead: [
    "Math.trunc(value), Math.round(value), or Math.floor(value) — say which you meant",
    "Number.parseInt(text, 10)",
    "if (!Number.isFinite(amount)) throw new NotANumber(text)",
  ],
  valve: { kind: "none" },
};

function isDoubleTilde(node: Node): boolean {
  if (node.type !== "UnaryExpression") return false;
  if (node["operator"] !== "~") return false;
  const argument = node["argument"];
  if (fieldAt(argument, "type") !== "UnaryExpression") {
    return false;
  }
  return fieldAt(argument, "operator") === "~";
}

const TRUNCATING: readonly string[] = ["|", ">>", ">>>", "<<"];

function isOrZero(node: Node): boolean {
  if (node.type !== "BinaryExpression") return false;
  const operator = node["operator"];
  if (typeof operator !== "string" || !TRUNCATING.includes(operator)) return false;
  const right = node["right"];
  if (fieldAt(right, "type") !== "NumericLiteral") {
    return false;
  }
  return fieldAt(right, "value") === 0;
}

const PARSE_INT: readonly string[] = ["parseInt"];

function isBaselessParseInt(node: Node): boolean {
  if (!isCallTo(node, PARSE_INT)) return false;
  const args = node["arguments"];
  return Array.isArray(args) && args.length < 2;
}

export const silentMangleCheck: Check = {
  rule: SILENT_MANGLE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (isDoubleTilde(node) || isOrZero(node)) {
        found.push({ line: lineOfNode(node) });
        return;
      }
      if (node.type === "CallExpression" && isBaselessParseInt(node)) {
        found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};
