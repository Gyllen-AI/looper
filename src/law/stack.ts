import type { Rule, Violation } from "./rule.ts";
import { STACK_PATH } from "../config.ts";
import { languageOf, languagesListedIn } from "../stack/read.ts";

export const UNDECLARED_LANGUAGE: Rule = {
  id: "STACK:1",
  category: "STACK",
  pass: "fast",
  bans: `a source file in a language ${STACK_PATH} does not list`,
  why:
    "a second language is a second runtime to install, a second dependency file to audit and a second thing nobody on the team may read. That is a decision about the project, and it is one that gets arrived at rather than made: an agent reaches for what it knows best for this one job, and three years later there are two of everything. This does not forbid the language — it insists the choice is visible to whoever reviews the commit",
  instead: [
    `add the row to ${STACK_PATH} in the same commit, and the decision is made rather than discovered`,
    `if the file is a build script or a fixture rather than something this project ships, it belongs outside the law — name its folder in law.toml`,
    `if ${STACK_PATH} does not exist yet, run \`looper init\` and looper writes what it measures`,
  ],
  valve: { kind: "none" },
};

export function undeclaredLanguagesIn(
  root: string,
  named: readonly string[],
): readonly Violation[] {
  const written = languagesListedIn(root);
  if (written.kind === "absent") return [];

  const found: Violation[] = [];
  for (const file of named) {
    const language = languageOf(file);
    if (language.length === 0) continue;
    if (written.languages.has(language)) continue;
    found.push({ rule: UNDECLARED_LANGUAGE, file, line: 1 });
  }
  return found;
}
