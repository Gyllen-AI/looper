import { RUST_CASES } from "./rust-cases.ts";
import { judgeCases, say } from "./rust-judge.ts";

const PARSES = RUST_CASES.filter((held) => held.rule !== "RUST-ERROR:9");

const judged = judgeCases(PARSES);
console.log(say(judged).join("\n"));
console.log(
  "\nRUST-ERROR:9 is judged on its own, because a file that will not parse stops the whole crate being read — which is the point of that rule and the reason it cannot share a crate with the others.",
);
console.log(
  `\n${PARSES.length} cases, ${judged.mismatches.length} mismatches, ${judged.notFixedYet.length} not fixed yet`,
);
