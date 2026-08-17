WHY THIS EXISTS. Temporary, out once someone outside this repo has shipped with
it. A person with an idea and no way to read code will point looper at their
project. They cannot check the work and have no engineer to ask, so the rules are
the reviewer who is not in the room. That is the product, and every choice here
answers to it. Building looper under its own rules is the only evidence they are
livable rather than merely defensible: every scar below was earned here first.

The canon above is in force; these are the rules only true here, kept few because
they cost tokens every turn.

- No network in the tree, ever, and no dependency that could grow one. This is
  the invariant the whole product rests on: looper runs on every edit and every
  commit, so it must not be able to phone home. `npm test` holds it: nothing in
  the resolved tree may open a socket, and versions are pinned so that means
  something. A dependency is a decision argued in `docs/PLAN.md` first.
- Where two readings are defensible, build the stricter one, and do it without
  asking. Budget, convention and comfort are not arguments, and finding a gap
  then asking permission to close it is the same failure wearing manners.
- Nothing load-bearing sits behind a command they must know to type.
- Nothing belonging to any adopting organisation enters this repo.

Ask for a rule set by name with the `doctrine` tool: `sources` before reading
any prior work.
