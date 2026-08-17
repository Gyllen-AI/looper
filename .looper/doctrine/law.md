Writing looper's own code, and writing the rules looper enforces.

- looper is governed by its own canon at full strength. `src/config.ts` is the
  one file where a missing value may become a default; only `src/git.ts` and
  `src/law/rust/drive.ts` start a process.
- **Fail open, but never fail silent.** The canon says a refusal has to be
  announced; here it also must not wedge the session it watches. Observe, then
  pass.
- **Ask what a file is before asking what is wrong with it.** Two languages
  means two laws, and a gate that forgets is worse than one that is missing: it
  reported every Rust file as unreadable TypeScript.
- **Judge a rule on precision, never severity.** The agent pays severity in the
  same turn from the repair prompt; only imprecision burns turns. A rule ships
  when it is decidable with no false positives and hands back a legal spelling.
- **A blunt rule is not a strict rule.** A stricter reading with no compliant
  path is broken: sharpen it rather than soften it.
- **Run every new rule over this repo before calling it done.** A rule tested only
  on fixtures its author wrote agrees with its author.
