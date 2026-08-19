import { test } from "node:test";
import assert from "node:assert/strict";

import { unproduced } from "../audit/vocab-scan.ts";
import { WITHOUT_THE_RUST_ENGINE } from "./rust-engine.ts";

test("every node type a rule matches on is one a parse actually produces", WITHOUT_THE_RUST_ENGINE, () => {
  const wrong = unproduced();
  assert.deepEqual(
    wrong,
    [],
    "a misspelled node type compiles, reviews clean, and makes its rule silently never fire",
  );
});
