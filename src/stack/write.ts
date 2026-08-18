import { STACK_PATH } from "../config.ts";
import type { Half, Stack } from "./read.ts";

const NOTHING_HERE = "_Nothing found. looper writes what it measures, so an empty half means an empty half._";

function rows(half: Half): readonly string[] {
  if (half.languages.length === 0) return [NOTHING_HERE];
  return [
    "| language | how looper knows |",
    "|---|---|",
    ...half.languages.map((held) => `| ${held.language} | ${held.because} |`),
  ];
}

export function stackDocument(stack: Stack, when: string): string {
  return [
    "# What this project is built from",
    "",
    "Measured by looper from what is on disk, not chosen. It is the record of a",
    "decision, so adding a language here is how you make that decision on purpose",
    "rather than by accident at four in the afternoon.",
    "",
    "`STACK:1` refuses a source file in a language this document does not list. The",
    "way through is to add the row, in the same commit, where a reviewer sees it.",
    "",
    "Counted from the files looper judges. Anything outside the law is not here — a",
    "vendored dependency, a folder named in `law.toml`, or a directory that governs",
    "itself — so this is what the rule can see rather than every file on disk.",
    "",
    "## Backend",
    "",
    ...rows(stack.backend),
    "",
    "## Frontend",
    "",
    ...rows(stack.frontend),
    "",
    `First written ${when}. looper never rewrites it: once this file exists it is`,
    "yours, and looper only reads it.",
    "",
  ].join("\n");
}

export { STACK_PATH };
