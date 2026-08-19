import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../ts/parse.ts";
import { isCallTo } from "../ts/nodes.ts";
import { fieldAt } from "../../fields.ts";
import { anyTraced, tracedFrom, valuesBoundIn, type Bindings } from "../ts/bindings.ts";

export const BUILT_COMMAND: Rule = {
  id: "NODE:1",
  onlyFor: "backend",
  category: "SECURITY",
  pass: "fast",
  bans: "building a command for the operating system by pasting values into it",
  why:
    "the text is handed to a shell, and a shell reads punctuation as instructions. A value containing a semicolon stops being a filename and becomes a second command, running with everything your program is allowed to do. A filename someone else chose is enough",
  instead: [
    "execFile('convert', [input, output]) — the arguments stay arguments and are never read as instructions",
    "spawn('git', ['clone', url])",
  ],
  valve: { kind: "none" },
};

const SHELLING: readonly string[] = ["exec", "execSync"];

function isARegExp(held: unknown): boolean {
  const type = fieldAt(held, "type");
  if (type === "RegExpLiteral") return true;
  return type === "NewExpression" && fieldAt(fieldAt(held, "callee"), "name") === "RegExp";
}

function reachesAShell(node: Node, bindings: Bindings): boolean {
  const callee = fieldAt(node, "callee");
  if (fieldAt(callee, "type") !== "MemberExpression") return true;
  const object = fieldAt(callee, "object");
  if (fieldAt(object, "type") !== "Identifier") return false;
  return !tracedFrom(object, bindings).some(isARegExp);
}

const SPAWNING: readonly string[] = ["spawn", "spawnSync", "execFile", "execFileSync"];

function asksForAShell(options: unknown): boolean {
  if (fieldAt(options, "type") !== "ObjectExpression") return false;
  const properties = fieldAt(options, "properties");
  if (!Array.isArray(properties)) return false;
  return properties.some((held) => {
    if (fieldAt(fieldAt(held, "key"), "name") !== "shell") return false;
    return fieldAt(fieldAt(held, "value"), "value") !== false;
  });
}

const PASTING_METHODS: readonly string[] = ["concat", "join"];

const SHELLS: readonly string[] = [
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
];

function pastedInto(argument: unknown): boolean {
  const type = fieldAt(argument, "type");
  if (type === "TemplateLiteral") {
    const expressions = fieldAt(argument, "expressions");
    return Array.isArray(expressions) && expressions.length > 0;
  }
  if (type === "CallExpression") {
    const callee = fieldAt(argument, "callee");
    if (fieldAt(callee, "type") !== "MemberExpression") return false;
    const named = fieldAt(fieldAt(callee, "property"), "name");
    if (typeof named !== "string" || !PASTING_METHODS.includes(named)) return false;
    const args = fieldAt(argument, "arguments");
    return Array.isArray(args);
  }
  if (type !== "BinaryExpression") return false;
  return fieldAt(argument, "operator") === "+";
}

function isAShell(program: unknown): boolean {
  const named = fieldAt(program, "value");
  if (typeof named !== "string") return false;
  const last = named.split(/[\\/]/).pop();
  return last !== undefined && SHELLS.includes(last);
}

function everyArgumentIn(args: readonly unknown[]): readonly unknown[] {
  const flat: unknown[] = [];
  for (const held of args) {
    flat.push(held);
    if (fieldAt(held, "type") !== "ArrayExpression") continue;
    const elements = fieldAt(held, "elements");
    if (Array.isArray(elements)) flat.push(...elements);
  }
  return flat;
}

export const builtCommandCheck: Check = {
  rule: BUILT_COMMAND,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const bindings: Bindings = valuesBoundIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      const shelling = isCallTo(node, SHELLING);
      if (!shelling && !isCallTo(node, SPAWNING)) return;
      if (shelling && !reachesAShell(node, bindings)) return;
      const args = node["arguments"];
      if (!Array.isArray(args)) return;
      const spawningAShell = !shelling && isAShell(args[0]);
      if (!shelling && !spawningAShell && !args.some(asksForAShell)) return;
      const carrying = spawningAShell ? everyArgumentIn(args) : [args[0]];
      if (carrying.some((held) => anyTraced(held, bindings, pastedInto))) {
        found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};
