import type { Concessions } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";

export const FILE_LENGTH: Rule = {
  id: "TS-DECOMPOSITION:1",
  category: "DECOMPOSITION",
  pass: "fast",
  bans: "a file longer than the cap",
  why:
    "a file that grew past one job is hiding the second one, and nobody goes looking for it there. Length is the only signal a rule can see for a file that stopped being about one thing, and the split is cheap now and expensive once three other files depend on the tangle",
  instead: [
    "move a group of things that belong together into their own file and import them back",
    "if two halves of the file never call each other, that is the line to cut along",
  ],
  valve: {
    kind: "knob",
    key: "max_loc",
    note: "the cap in lines. Machine-generated files are the honest reason to move it; better to pardon those by name under [exempt] so the cap keeps meaning for the code you write",
  },
};

const WHOLE_FILE = 0;

export const fileLengthCheck: Check = {
  rule: FILE_LENGTH,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    const lines = subject.text.split("\n").length;
    if (lines <= concessions.maxLoc) return [];
    return [{ line: concessions.maxLoc + 1 }];
  },
};
