Writing Rust in a governed project. The compiler is already the deputy, so these
are the failures it does not catch.

- No comments. Names, types and asserts carry the meaning, prose goes in a
  document beside the code, and the reason goes in the commit message.
- An error is a named type, never a bare string and never a boxed anything. A
  caller that cannot tell one failure from another cannot handle either.
- `unwrap`, `expect`, `ok()` on a `Result`, and `let _ =` are all the same act:
  a failure deleted. Propagate it, crash on purpose, or handle it in the open.
- `as` between number types truncates in silence. `TryFrom` says what happens
  when it does not fit, which is the only version that survives real input.
- Tests live in `tests/`, beside what they prove, never buried in the file they
  are testing.
- The half no gate can judge: keep the interface small and the types plain. If a
  new reader cannot follow it in one pass, rewrite it until they can.
- **Logging is `observe/logging`.** Same rules in every language, kept in one place.
