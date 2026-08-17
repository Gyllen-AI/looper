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

function settingRead(node: Node): string | null {
  if (node.type !== "MemberExpression") return null;
  const object = node["object"];
  if (fieldAt(object, "type") !== "MemberExpression") {
    return null;
  }
  const holder = fieldAt(object, "object");
  const env = fieldAt(object, "property");
  if (holder === null || typeof holder !== "object") return null;
  if (env === null || typeof env !== "object") return null;
  if (fieldAt(holder, "name") !== "process") return null;
  if (fieldAt(env, "name") !== "env") return null;

  const named = node["property"];
  const name = fieldAt(named, "name");
  return typeof name === "string" ? name : null;
}

export const clientSecretCheck: Check = {
  rule: CLIENT_SECRET,

  run(subject: Subject): readonly Finding[] {
    if (!subject.text.includes(CLIENT_DIRECTIVE)) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];
    if (!runsInBrowser(parsed.root)) return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      const name = settingRead(node);
      if (name === null || name.startsWith(PUBLIC_PREFIX)) return;
      found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
