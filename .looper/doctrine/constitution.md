The canon above is in force; these are the rules only true here, kept few because
they cost tokens every turn.

- **No network in the tree, ever, and no dependency that could grow one.** looper
  runs on every edit and every commit, so it must not be able to phone home.
  `npm test` holds it: nothing in the resolved tree may open a socket, and
  versions are pinned. A dependency is argued in `docs/PLAN.md` first.
- **Where two readings are defensible, build the stricter one, without asking.**
  Budget, convention and comfort are not arguments; finding a gap and asking
  permission to close it is the same failure wearing manners.
- **The only input is a sentence.** No command, no file name, no order of steps:
  looper does it on an ordinary turn and says what it did. Finding 88 shipped a
  rule only `init` reached.
- Nothing belonging to any adopting organisation enters this repo.

Ask for a rule set by name with the `doctrine` tool: `sources` before reading
any prior work.
