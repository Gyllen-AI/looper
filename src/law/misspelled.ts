import { existsSync } from "node:fs";
import { join } from "node:path";

import { RUST_EXTENSION } from "../config.ts";
import { isNamed, withoutLanguage, type Concessions } from "./concessions.ts";
import { judgedFiles } from "./project.ts";
import { required } from "../present.ts";

const ALL_RULES = "ALL";

const NEAR_ENOUGH = 3;

const RUST_PREFIX = "RUST-";

function distance(left: string, right: string): number {
  const row: number[] = Array.from({ length: right.length + 1 }, (_, at) => at);
  for (let down = 1; down <= left.length; down += 1) {
    let corner = required(row[0], "the first cell of the row");
    row[0] = down;
    for (let across = 1; across <= right.length; across += 1) {
      const was = required(row[across], "the cell above");
      const before = required(row[across - 1], "the cell to the left");
      const same = left[down - 1] === right[across - 1];
      row[across] = Math.min(was + 1, before + 1, corner + (same ? 0 : 1));
      corner = was;
    }
  }
  return required(row[right.length], "the last cell of the row");
}

function nearestTo(wanted: string, known: readonly string[]): string | null {
  let best: string | null = null;
  let closest = NEAR_ENOUGH + 1;
  for (const held of known) {
    const apart = distance(wanted.toUpperCase(), held.toUpperCase());
    if (apart >= closest) continue;
    closest = apart;
    best = held;
  }
  return best;
}

function spokenHere(file: string, known: readonly string[]): readonly string[] {
  const rust = file.endsWith(RUST_EXTENSION);
  const sameLanguage = known.filter((held) => held.startsWith(RUST_PREFIX) === rust);
  if (sameLanguage.length === 0) return known;
  return sameLanguage;
}

function isKnown(named: string, known: readonly string[]): boolean {
  if (known.includes(named)) return true;
  const bare = withoutLanguage(named);
  return known.some((held) => withoutLanguage(held) === bare);
}

function unknownRule(named: string, known: readonly string[], where: string): string {
  const nearest = nearestTo(named, known);
  const guess = nearest === null ? "" : ` Did you mean ${nearest}?`;
  return `looper: ${where} names ${named}, which is not a rule, so it does nothing.${guess}`;
}

function anythingNamed(root: string, file: string): boolean {
  if (existsSync(join(root, file))) return true;
  return judgedFiles(root).some((path) => isNamed(path, [file]));
}

export function misspelledIn(
  concessions: Concessions,
  known: readonly string[],
): readonly string[] {
  const said: string[] = [];

  for (const named of concessions.disabled) {
    if (named === ALL_RULES) {
      said.push(
        "looper: law.toml [rules] disabled names ALL, which does nothing here. Rules are turned off one at a time, by name. To excuse a whole file instead, name it under [exempt].",
      );
      continue;
    }
    if (isKnown(named, known)) continue;
    said.push(unknownRule(named, known, "law.toml [rules] disabled"));
  }

  for (const [file, rules] of concessions.pardons) {
    if (!anythingNamed(concessions.projectRoot, file)) {
      said.push(
        `looper: law.toml [exempt] names ${file}, and there is no such file, so it does nothing.`,
      );
    }
    for (const named of rules) {
      if (named === ALL_RULES || isKnown(named, known)) continue;
      said.push(unknownRule(named, spokenHere(file, known), `law.toml [exempt] "${file}"`));
    }
  }

  return said;
}
