import { test } from "node:test";
import assert from "node:assert/strict";

import { RUST_CASES } from "../audit/rust-cases.ts";
import { judgeCases, say } from "../audit/rust-judge.ts";

const PARSES = RUST_CASES.filter((held) => held.rule !== "RUST-ERROR:9");

test("every Rust case agrees with the rule it was written from", () => {
  const judged = judgeCases(PARSES);

  assert.deepEqual(
    judged.mismatches.map((one) => `${one.held.rule} ${one.held.name}`),
    [],
    `the Rust half is judged by 28 rules and audit/ spoke only TypeScript until now:\n${say(judged).join("\n")}`,
  );
});

test("the known misses are still missed, so the day they are fixed is visible", () => {
  const judged = judgeCases(PARSES);

  assert.equal(
    judged.notFixedYet.length,
    PARSES.filter((held) => held.notFixedYet !== undefined).length,
    "a case marked as not fixed yet started passing. That is good news and it means the case belongs in the ordinary set now, with its note removed.",
  );
});

test("a file the Rust reader cannot parse does not take its crate down in silence", () => {
  const judged = judgeCases([
    { rule: "RUST-ERROR:9", name: "not Rust at all", code: "this is not rust {{{", expect: "fires" },
    { rule: "RUST-ERROR:1", name: "an unwrap beside it", code: "pub fn f(v: Result<u8, u8>) -> u8 { v.unwrap() }", expect: "fires" },
  ]);

  assert.equal(
    judged.mismatches.length,
    1,
    "one unparseable file silences every other file in the crate. That is worth knowing rather than passing, and looper now says how many went unjudged.",
  );
});
