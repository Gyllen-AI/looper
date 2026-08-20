import { test } from "node:test";
import assert from "node:assert/strict";

import { ageOfOurCode, agingSaid } from "../src/code-age.ts";

test("a server whose code has not moved says nothing at all", () => {
  assert.equal(agingSaid(ageOfOurCode()), "");
});

test("a server running code older than what is on disk says so, and says what to do", () => {
  const loaded = ageOfOurCode();
  const behind = { newest: loaded.newest - 60_000, files: loaded.files };

  const said = agingSaid(behind);

  assert.notEqual(
    said,
    "",
    "a long-lived server keeps answering from the code it loaded while npm install replaces the files underneath it, and its stale answer is word for word what looper says when a thing genuinely does not exist",
  );
  assert.match(said, /reconnect/i);
});

test("a file count that changed is enough on its own, because a file can arrive without any of its neighbours moving", () => {
  const loaded = ageOfOurCode();
  const fewer = { newest: loaded.newest, files: loaded.files - 1 };

  assert.notEqual(agingSaid(fewer), "");
});
