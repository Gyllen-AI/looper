Writing looper's own code, and writing the rules looper enforces.

- looper is governed by its own canon at full strength. `src/config.ts` is the
  one file where a missing value may become a default; only `src/git.ts` and
  the two language drivers under `src/law/rust` and `src/law/python` start a
  process.
- **Fail open, but never fail silent.** The canon says a refusal has to be
  announced; here it also must not wedge the session it watches. Observe, then
  pass.
- **Ask what a file is before asking what is wrong with it.** Two languages
  means two laws, and a gate that forgets is worse than one that is missing: it
  reported every Rust file as unreadable TypeScript. A hook payload too: judge
  what the person wrote, not the envelope, whose random ids read as secrets.
- **Judge a rule on precision, never severity.** The agent pays severity in the
  same turn from the repair prompt; only imprecision burns turns. A rule ships
  when it is decidable with no false positives and hands back a legal spelling.
- **A blunt rule is not a strict rule.** A stricter reading with no compliant
  path is broken: sharpen it rather than soften it.
- **Run every new rule over this repo before calling it done.** A rule tested only
  on fixtures its author wrote agrees with its author.
- **A refusal closes the routes around it and names the one that is open.** An
  agent that cannot commit will ask its human to type the command; a refusal that
  does not say so has left the door it was standing in front of.
- **Fixing this in a fork means it is broken for everyone running it, so send it
  back.** A pull request or an issue at `github.com/gyllen-ai/looper`, with what
  you saw — fifteen arrived from one adopting project on 2026-08-18 and fourteen
  are already in, including the one that made the seer work at all.
