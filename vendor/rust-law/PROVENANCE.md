# Where this came from

This directory is looper's Rust law: the part that reads `.rs` files and judges
them. looper's own code is TypeScript, so this half is Rust, because reading
Rust properly means using `syn`, and `syn` is a Rust crate.

**It was not written here.** It is a copy of Zmole Cristian's `lawkeeper`
(<https://github.com/ZmoleCristian/lawkeeper>), taken at commit
`4953860bd3eb38ea764884af656c83f46b5684f5`, which is the revision that had been
reviewed and run in production in another project before it was brought here.

It is licensed **0BSD** — see `LICENSE`. That licence permits copying,
modification and redistribution with no attribution required. This file exists
anyway, because knowing where 3,900 lines of a repository came from is worth
more than the licence obliges.

**What changed on the way in.** The package is named for what it does here
rather than for the project it came from: the crate is `looper-rust-law`, the
library is `rust_law`, and the program looper runs is `looper-rust`. Its own
command-line and MCP surfaces were dropped — looper is the only caller, and it
drives this over one narrow interface. Nothing else in the source was altered.

**What it does not include.** `rustgraph`, the call-graph engine the earlier
project used beside it, is not here. That serves a `reuse` capability looper has
not built and has deliberately deferred, and the law engine does not depend on
it: its dependencies are `syn`, `proc-macro2`, `serde` and `toml`, and nothing
else.

**What we changed in the copied source, 2026-08-18.** One attribute in
`src/config.rs`: `#[serde(default, deny_unknown_fields)]` on `LawConfig` became
`#[serde(default)]`. With it, any top-level table the engine does not own — the
`[entry]` and `[ts]` sections looper's TypeScript half reads out of the same
file — made the engine reject the whole `law.toml`, and it failed as "could not
read law.toml" rather than as anything naming the cause. The four
`deny_unknown_fields` on the inner tables are untouched, because there a typo
really is a concession nobody notices: `sanctm` is still refused by name.

This is a change to somebody else's code and it has a price. Whoever copies a
newer lawkeeper in must re-apply it, and `tests/invariants.test.ts` fails until
they do, which is the only reason that price is payable.

**The one line in the manifest that is ours.** `[workspace]`, empty, at the top
of `Cargo.toml`. Without it, a looper checked out inside a Rust project is
claimed by that project's workspace and cargo refuses to build it at all —
`current package believes it's in a workspace when it's not`. An empty workspace
table makes this crate its own root, so no ancestor manifest can claim it, and
every consumer is spared discovering `exclude` for their own `Cargo.toml`. It
changes nothing about the copied source. Added 2026-08-18 from adopter issue #3,
which arrived with the fix already measured at 16.56s for a clean release build.

**The one file here that is ours.** `src/bin/looper-rust.rs` is written by us,
not copied, and it is the only interface looper uses:

```
looper-rust <root>              judge the whole crate
looper-rust <root> <file>...    judge only these files
looper-rust --commands <root>   list the Tauri commands it declares
```

Output on stdout is one JSON object — `{"violations":[{"rule","file","line"}]}`,
`{"commands":[…]}`, or `{"error":"…"}` with a non-zero exit. Nothing else is
ever printed, because looper parses it.

It carries no comments, for the same reason nothing else here does. This
directory is outside the law by default — it holds somebody else's code — and
that file is inside it only because it has to compile with the crate. A test
judges it anyway.

**What we know it does not catch.** Found by the audit of 2026-08-17 and left
alone on purpose. Patching vendored source means owning the change forever and
conflicting with every future copy, so these are recorded here and belong
upstream rather than in a local diff:

- `Err(_) => "".to_string()` — `ERROR:3` names `String::new()` and an empty
  collection; this is the same empty string, built differently.
- `panic!("not implemented yet")` — `DEAD:3` names `todo!`. Its own reason is
  half-built code that compiles, which this is. Narrower than banning every
  `panic!`, which `ERROR:4` explicitly permits as the crash door.
- `let g = Option::unwrap; g(x)` — `ERROR:1` reads the method, not an alias.
- `Command::new("printenv")` — `TRUTH:2` names `std::env` and the `env!` macros,
  not the environment reached through a subprocess.
- `x == Delimiter::None` — `ERROR:1` bans comparing against `None`, meaning
  `Option::None`. A syntax-only reader cannot tell one `None` from another, and
  this fires toward strictness.

The last three are rare enough in real Rust to argue about. The first two are
one word from a spelling the rule already catches.

**Four more, found by an adopter and reproduced here, 2026-08-18.** `TYPE:4`
(`as`), `TRUTH:2` (`std::env`), `DEAD:3` (`todo!`) and `LAYER:2` (a `crate::`
path) all go silent inside a macro argument — `format!`, `assert_eq!`,
`tracing::info!`, or any `macro_rules!` that passes its argument through. The
same expression on its own line fires. It is not that a syntax reader cannot see
into macros: `ERROR:1`, `TYPE:5`, `LOG:2` and `ERROR:7` scan tokens and keep
working there. It is four rules matching on typed syntax that a macro's tokens
never become.

Three of the four are held as known misses in `audit/rust-cases.ts`, so the day
they start firing the suite says so and the cases move into the ordinary set.
They belong upstream, like the five above.

**Updating it.** Nothing fetches this. If the upstream project fixes something
worth having, someone copies the new source in by hand, deliberately, and says
so in the commit. That is the price of never downloading anything, and it is
paid on purpose.
