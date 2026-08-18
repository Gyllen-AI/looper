import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../ts/parse.ts";
import { fieldAt } from "../../fields.ts";

export const CLIENT_SECRET: Rule = {
  id: "NEXT:1",
  category: "SECURITY",
  pass: "fast",
  bans: "reading a setting that is not marked public, in a file that runs in the browser",
  why:
    'a file marked "use client" is sent to whoever opens the page, settings and all. A key read there is not hidden in the program — it is printed in the page source, where anyone can read it by right-clicking. This is how API keys and database passwords end up public, and nothing about the code looks wrong',
  instead: [
    "read it on the server and pass down only the answer, never the key",
    "if it genuinely is public, name it so: process.env.NEXT_PUBLIC_MAP_STYLE",
    "keep the file off the client: a component without 'use client' never reaches the browser",
  ],
  valve: { kind: "none" },
};

const CLIENT_DIRECTIVE = "use client";

const PUBLIC_PREFIX = "NEXT_PUBLIC_";

function runsInBrowser(root: Node): boolean {
  const directives = root["directives"];
  if (!Array.isArray(directives)) return false;
  return directives.some((held) => {
    if (held === null || typeof held !== "object") return false;
    const value = fieldAt(held, "value");
    if (value === null || typeof value !== "object") return false;
    return fieldAt(value, "value") === CLIENT_DIRECTIVE;
  });
}

function isTheSettings(node: unknown): boolean {
  if (fieldAt(node, "type") !== "MemberExpression") return false;
  const holder = fieldAt(node, "object");
  const env = fieldAt(node, "property");
  if (holder === null || typeof holder !== "object") return false;
  if (env === null || typeof env !== "object") return false;
  return fieldAt(holder, "name") === "process" && fieldAt(env, "name") === "env";
}

function nameRead(node: Node): string | null {
  const named = node["property"];
  const plain = fieldAt(named, "name");
  if (typeof plain === "string") return plain;
  const quoted = fieldAt(named, "value");
  return typeof quoted === "string" ? quoted : null;
}

function settingRead(node: Node, aliases: ReadonlySet<string>): string | null {
  if (node.type !== "MemberExpression") return null;
  const object = node["object"];
  const named = fieldAt(object, "name");
  const onTheSettings =
    isTheSettings(object) || (typeof named === "string" && aliases.has(named));
  if (!onTheSettings) return null;
  return nameRead(node);
}

function aliasesOfSettings(root: Node): ReadonlySet<string> {
  const named = new Set<string>();
  walk(root, (node) => {
    if (node.type !== "VariableDeclarator") return;
    if (!isTheSettings(node["init"])) return;
    const held = fieldAt(node["id"], "name");
    if (typeof held === "string") named.add(held);
  });
  return named;
}

function takenApart(node: Node): readonly string[] {
  if (node.type !== "VariableDeclarator") return [];
  if (!isTheSettings(node["init"])) return [];
  const id = node["id"];
  if (fieldAt(id, "type") !== "ObjectPattern") return [];
  const properties = fieldAt(id, "properties");
  if (!Array.isArray(properties)) return [];
  const found: string[] = [];
  for (const held of properties) {
    if (fieldAt(held, "type") === "RestElement") {
      found.push("");
      continue;
    }
    const key = fieldAt(held, "key");
    const plain = fieldAt(key, "name");
    if (typeof plain === "string") {
      found.push(plain);
      continue;
    }
    const quoted = fieldAt(key, "value");
    if (typeof quoted === "string") found.push(quoted);
  }
  return found;
}

export const clientSecretCheck: Check = {
  rule: CLIENT_SECRET,

  run(subject: Subject): readonly Finding[] {
    if (!subject.text.includes(CLIENT_DIRECTIVE)) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];
    if (!runsInBrowser(parsed.root)) return [];

    const aliases = aliasesOfSettings(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      for (const name of takenApart(node)) {
        if (name.startsWith(PUBLIC_PREFIX)) continue;
        found.push({ line: lineOfNode(node) });
      }
      const name = settingRead(node, aliases);
      if (name === null || name.startsWith(PUBLIC_PREFIX)) return;
      found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
