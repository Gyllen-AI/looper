import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const WRITTEN_HERE: readonly string[] = ["src", "bin"];

export function sourceFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".js")) found.push(path);
  }
  return found;
}

export function ourFiles(): readonly string[] {
  return WRITTEN_HERE.flatMap((part) => sourceFiles(join(ROOT, part)));
}
