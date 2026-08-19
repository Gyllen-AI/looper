import type { Rule, Violation } from "./rule.ts";
import { STACK_PATH } from "../config.ts";
import { isTheInterface, languageOf, languagesListedIn } from "../stack/read.ts";

export const UNDECLARED_LANGUAGE: Rule = {
  id: "STACK:1",
  category: "STACK",
  pass: "fast",
  bans: `a source file in a language ${STACK_PATH} does not list for the half it lands in — the interface, or everything behind it`,
  why:
    "a second language is a second runtime to install, a second dependency file to audit and a second thing nobody on the team may read. That is a decision about the project, and it is one that gets arrived at rather than made: an agent reaches for what it knows best for this one job, and three years later there are two of everything. The halves are judged apart because a language chosen for the backend was not chosen for the interface, and reading the document as one list lets a whole front end appear in a language nobody picked for it. This does not forbid the language — it insists the choice is visible to whoever reviews the commit",
  instead: [
    `add the row to ${STACK_PATH} in the same commit, under the half it belongs to, and the decision is made rather than discovered`,
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
    const half = isTheInterface(file) ? written.frontend : written.backend;
    if (half.has(language)) continue;
    found.push({ rule: UNDECLARED_LANGUAGE, file, line: 1 });
  }
  return found;
}
