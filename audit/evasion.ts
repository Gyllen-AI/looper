import { CHECKS } from "../src/law/checks.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { CASES } from "./cases.ts";
import { disagreements } from "./judge.ts";

const said = disagreements(CASES, CHECKS, CONCEDING_NOTHING);
console.log(said.join("\n"));
console.log(`\n${CASES.length} cases, ${said.length} mismatches`);
