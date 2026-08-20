Writing looper's own code.

- **looper is governed by its own canon at full strength.** `src/config.ts` is
  the one file where a missing value may become a default; only `src/git.ts` and
  the language drivers under `src/law/rust` and `src/law/python` start a process.
- **Fail open, but never fail silent.** A refusal is announced, and it must not
  wedge the session it watches. Observe, then pass.
- **Ask what a file is before asking what is wrong with it.** A gate that forgot
  reported every Rust file as unreadable TypeScript. A hook payload too: judge
  what the person wrote, not the envelope, whose random ids read as secrets.
- **A count is not something anyone can act on.** Say what it is about, capped
  and with "and N more", never a number and an instruction to go and ask (#134;
  looper's own status lines had still not learned it by #164).
- **A refusal closes the routes around it and names the one that is open.** An
  agent that cannot commit will ask its human to type the command; say so.
- **Fixing this in a fork means it is broken for everyone running it, so send it
  back:** a pull request or an issue at `github.com/gyllen-ai/looper`, with what
  you saw. Fifteen arrived from one adopter on 2026-08-18; fourteen are in.
