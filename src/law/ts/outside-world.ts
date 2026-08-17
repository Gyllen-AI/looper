import type { Concessions } from "../concessions.ts";
import { isNamed } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { reachIn, reaches, type Reach } from "./globals.ts";
import { fieldAt } from "../../fields.ts";

export const OUTSIDE_WORLD: Rule = {
  id: "TS-TRUTH:2",
  category: "TRUTH",
  pass: "fast",
  bans: "reading `process.env` or `import.meta.env` anywhere but the one file that gathers settings",
  why:
    "settings enter a program in one place or they enter in every place. Scattered, nobody can answer what the program needs to run, a missing one is found by whichever line happens to run first, and a test cannot hand it anything different",
  instead: [
    "read it in config.ts, put it in a typed object, and pass that object down",
    "export const config = { databaseUrl: required('DATABASE_URL') }",
  ],
  valve: {
    kind: "knob",
    key: "[ts] env_files",
    note: "the files allowed to read the outside world; defaults to your settings file and whatever package.json declares as an entry point",
  },
};

const OUTSIDE: readonly (readonly string[])[] = [
  ["process", "env"],
  ["import", "meta", "env"],
];

function outside(value: unknown, reach: Reach): boolean {
  return OUTSIDE.some((wanted) => reaches(value, reach, wanted));
}

function headNameOf(value: unknown): string | null {
  const type = fieldAt(value, "type");
  if (type === "Identifier") {
    const name = fieldAt(value, "name");
    return typeof name === "string" ? name : null;
  }
  if (type !== "MemberExpression" && type !== "OptionalMemberExpression") return null;
  return headNameOf(fieldAt(value, "object"));
}

function isAlreadyRead(node: unknown, reach: Reach): boolean {
  const name = headNameOf(node);
  if (name === null) return false;
  const alias = reach.aliases.get(name);
  if (alias === undefined) return false;
  return OUTSIDE.some((wanted) => wanted.every((step, at) => alias[at] === step));
}

function opensADoor(node: Node, reach: Reach): boolean {
  if (node.type !== "VariableDeclarator") return false;
  if (fieldAt(node["id"], "type") !== "ObjectPattern") return false;
  const properties = fieldAt(node["id"], "properties");
  if (!Array.isArray(properties)) return false;
  return properties.some((held) => {
    const local = fieldAt(fieldAt(held, "value"), "name");
    if (typeof local !== "string") return false;
    return isAlreadyRead({ type: "Identifier", name: local }, reach);
  });
}

export const outsideWorldCheck: Check = {
  rule: OUTSIDE_WORLD,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (isNamed(subject.file, concessions.envFiles)) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const reach = reachIn(parsed.root);
    const found: Finding[] = [];
    const seen = new Set<number>();
    walk(parsed.root, (node) => {
      const named = opensADoor(node, reach);
      if (!named && (!outside(node, reach) || isAlreadyRead(node, reach))) return;
      const line = lineOfNode(node);
      if (seen.has(line)) return;
      seen.add(line);
      found.push({ line });
    });
    return found;
  },
};
