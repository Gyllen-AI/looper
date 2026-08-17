import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../ts/parse.ts";
import { isCallTo } from "../ts/nodes.ts";
import { fieldAt } from "../../fields.ts";
import { anyTraced, valuesBoundIn, type Bindings } from "../ts/bindings.ts";

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

function pastedInto(argument: unknown): boolean {
  const type = fieldAt(argument, "type");
  if (type === "TemplateLiteral") {
    const expressions = fieldAt(argument, "expressions");
    return Array.isArray(expressions) && expressions.length > 0;
  }
  if (type !== "BinaryExpression") return false;
  return fieldAt(argument, "operator") === "+";
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
      const args = node["arguments"];
      if (!Array.isArray(args)) return;
      if (!shelling && !args.some(asksForAShell)) return;
      if (anyTraced(args[0], bindings, pastedInto)) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
