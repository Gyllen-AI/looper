export type Category =
  | "SECURITY"
  | "DECOMPOSITION"
  | "LAYER"
  | "ERROR"
  | "TYPE"
  | "DEAD"
  | "TRUTH"
  | "LOG"
  | "TESTS"
  | "STACK";

export type Pass = "fast" | "slow";

export type Role = "backend" | "interface";

export type Valve =
  | { readonly kind: "none" }
  | { readonly kind: "knob"; readonly key: string; readonly note: string };

export type Rule = {
  readonly id: string;
  readonly category: Category;
  readonly onlyFor?: Role;
  readonly pass: Pass;
  readonly bans: string;
  readonly why: string;
  readonly instead: readonly string[];
  readonly valve: Valve;
};

export type Violation = {
  readonly rule: Rule;
  readonly file: string;
  readonly line: number;
  readonly said?: string;
};

export const CATEGORY_ORDER: readonly Category[] = [
  "SECURITY",
  "DECOMPOSITION",
  "LAYER",
  "ERROR",
  "TYPE",
  "DEAD",
  "TRUTH",
  "LOG",
  "TESTS",
  "STACK",
];

const SPIRIT: Readonly<Record<Category, string>> = {
  SECURITY:
    "someone is going to send your program something you did not expect, on purpose. these are the ways that ends badly.",
  DECOMPOSITION: "every file has one job. if it outgrew that job, split it.",
  LAYER:
    "the imports are the architecture. declare which parts may reach which, and only ever reach downward.",
  ERROR:
    "pass the failure on, or stop, or write it down. a failure that does none of those is gone.",
  TYPE: "the signature is the promise. an unnamed type promises nothing.",
  DEAD: "code not serving the program right now is noise, and noise misleads.",
  TRUTH: "every fact has one home. two homes means none.",
  LOG: "output belongs to whoever started the program. diagnostics go to the logger.",
  STACK:
    "the languages a codebase speaks is a decision, and it is the one most often arrived at rather than made.",
  TESTS: "a test drives what a real caller can reach, and nothing else.",
};

export function spiritOf(category: Category): string {
  return SPIRIT[category];
}
