import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const VALUE_IN_MESSAGE: Rule = {
  id: "TS-LOG:3",
  category: "LOG",
  pass: "fast",
  bans:
    "a value interpolated into a log message instead of carried as a field — a template literal or a concatenation handed to a logger, in a file that imports one",
  why:
    "a message with the value baked in is a sentence, and every line is a different sentence. The only way to find them later is to guess the wording, and the value cannot be filtered, counted or grouped by anything. A field keeps the message constant and the value queryable, which is the difference between a log you read at three in the morning and one you can ask a question of",
  instead: [
    "logger.info({ order: id }, 'saved') — the message is a constant, everything that varies sits beside it",
    "logger.error({ err }, 'could not save') — the error is a field, not a sentence fragment",
    "a value nobody will ever query does not need to be in the log line at all",
  ],
  valve: {
    kind: "knob",
    key: "[ts] loggers",
    note: "the packages whose calls this judges; defaults to the common logging packages, and a file importing none of them is not judged at all",
  },
};

const LEVELS: ReadonlySet<string> = new Set([
  "info",
  "warn",
  "error",
  "debug",
  "trace",
  "fatal",
]);

const KNOWN_LOGGERS: readonly string[] = [
  "pino",
  "winston",
  "bunyan",
  "loglevel",
  "consola",
  "signale",
  "tslog",
  "roarr",
  "log4js",
  "@std/log",
];

function importsALogger(tree: Node, named: readonly string[]): boolean {
  let found = false;
  walk(tree, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const source = node["source"];
    if (source === null || typeof source !== "object") return;
    const specifier = fieldAt(source, "value");
    if (typeof specifier !== "string") return;
    if (named.some((one) => specifier === one || specifier.startsWith(`${one}/`))) found = true;
  });
  return found;
}

function isAString(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  if (fieldAt(node, "type") !== "StringLiteral") return false;
  return true;
}

function bakesInAValue(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  const type = fieldAt(node, "type");
  if (type === "TemplateLiteral") {
    const expressions = fieldAt(node, "expressions");
    return Array.isArray(expressions) && expressions.length > 0;
  }
  if (type === "BinaryExpression" && fieldAt(node, "operator") === "+") {
    return isAString(fieldAt(node, "left")) || isAString(fieldAt(node, "right"));
  }
  return false;
}

function callsALevel(callee: unknown): boolean {
  if (callee === null || typeof callee !== "object") return false;
  if (fieldAt(callee, "type") !== "MemberExpression") return false;
  const property = fieldAt(callee, "property");
  if (property === null || typeof property !== "object") return false;
  const name = fieldAt(property, "name");
  return typeof name === "string" && LEVELS.has(name);
}

export const valueInMessageCheck: Check = {
  rule: VALUE_IN_MESSAGE,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const named = concessions.loggers.length > 0 ? concessions.loggers : KNOWN_LOGGERS;
    if (!importsALogger(parsed.root, named)) return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type !== "CallExpression") return;
      if (!callsALevel(node["callee"])) return;
      const args = node["arguments"];
      if (!Array.isArray(args)) return;
      if (args.some(bakesInAValue)) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
