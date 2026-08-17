import { parse } from "@babel/parser";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { fieldAt } from "../src/fields.ts";
import { countIn } from "../src/present.ts";

type Seen = { readonly literals: Map<string, Set<string>>; readonly used: Map<string, number>; readonly exported: Map<string, string> };

function walk(node: unknown, visit: (held: object) => void): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof fieldAt(node, "type") === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments") continue;
    walk(fieldAt(node, key), visit);
  }
}

function noteExport(node: object, file: string, into: Map<string, string>): void {
  const declaration = fieldAt(node, "declaration");
  const kind = fieldAt(declaration, "type");
  if (kind === "FunctionDeclaration" || kind === "ClassDeclaration") {
    const name = fieldAt(fieldAt(declaration, "id"), "name");
    if (typeof name === "string") into.set(name, file);
    return;
  }
  if (kind !== "VariableDeclaration") return;
  const declarators = fieldAt(declaration, "declarations");
  if (!Array.isArray(declarators)) return;
  for (const held of declarators) {
    const name = fieldAt(fieldAt(held, "id"), "name");
    if (typeof name === "string") into.set(name, file);
  }
}

function survey(files: readonly string[]): Seen {
  const seen: Seen = { literals: new Map(), used: new Map(), exported: new Map() };
  for (const file of files) {
    const ast = parse(readFileSync(file, "utf8"), {
      sourceType: "module",
      plugins: ["typescript"],
      errorRecovery: true,
    });
    walk(fieldAt(ast, "program"), (node) => {
      const kind = fieldAt(node, "type");
      const value = fieldAt(node, "value");
      if (kind === "StringLiteral" && typeof value === "string" && value.length >= 4) {
        const at = seen.literals.get(value);
        if (at === undefined) seen.literals.set(value, new Set([file]));
        else at.add(file);
      }
      const name = fieldAt(node, "name");
      if (kind === "Identifier" && typeof name === "string") {
        seen.used.set(name, countIn(seen.used, name) + 1);
      }
      if (kind === "ExportNamedDeclaration") noteExport(node, file, seen.exported);
    });
  }
  return seen;
}

function lines(seen: Seen): readonly string[] {
  const out: string[] = ["=== string literals repeated in 3 or more files ==="];
  const rows = [...seen.literals.entries()]
    .filter(([, files]) => files.size >= 3)
    .sort((left, right) => right[1].size - left[1].size);
  for (const [value, files] of rows.slice(0, 22)) {
    out.push(`  ${String(files.size).padStart(3)}x  ${JSON.stringify(value)}`);
  }
  out.push(`  (${rows.length} distinct literals repeated across 3 or more files)`);
  out.push("", "=== exports referenced only where they are declared ===");
  let dead = 0;
  for (const [name, file] of seen.exported) {
    if (countIn(seen.used, name) > 1) continue;
    out.push(`  ${name.padEnd(28)} ${file}`);
    dead += 1;
  }
  out.push(`  ${seen.exported.size} exports, ${dead} referenced once`);
  return out;
}

const found = execSync("find src -name '*.ts'", { encoding: "utf8" }).trim().split("\n");
console.log(lines(survey(found)).join("\n"));
