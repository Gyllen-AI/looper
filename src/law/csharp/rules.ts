import type { Rule } from "../rule.ts";

export const CSHARP_RULES: readonly Rule[] = [
  {
    id: "CS-ERROR:1",
    category: "ERROR",
    pass: "fast",
    bans:
      "a `catch` whose body is empty and which names nothing — a bare `catch`, or `catch (Exception)` and `catch (SystemException)`, which are the same thing with a word in front. A comment in the body does not count as naming it",
    why:
      "a caught failure leaves through one of three doors: thrown onward, returned to the caller, or written down where somebody will read it. An empty `catch` uses none of them, so the program carries on as though the work succeeded and the wrong answer surfaces somewhere else entirely, with nothing left to say where it started. A comment in the body changes nothing: the person reading the log at two in the morning cannot see it",
    instead: [
      "write it down and carry on: `catch (Exception error) { _logger.LogWarning(error, \"could not read {Path}\", path); }`",
      "throw it onward untouched: `catch (Exception) { throw; }`",
      "turn it into a failure the caller can act on: `catch (IOException error) { throw new DatasetMissing(path, error); }`",
      "if one failure truly does not matter here, name that one and the catch may stay empty: `catch (TaskCanceledException) { }`",
      "or name it with a filter, which this rule also accepts: `catch (Exception error) when (IsExpectedShutdown(error)) { }`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "CS-ERROR:2",
    category: "ERROR",
    pass: "fast",
    bans: "`throw new Exception(...)` — the failure type that says nothing about itself",
    why:
      "every caller above this line now catches the same type, so none of them can tell one failure from another. A missing file, a refused password and a broken connection all arrive looking identical, which means the only possible response is to treat them identically. The message inside is for a person reading a log, not for the code that has to decide what to do next",
    instead: [
      "one of the failures the language already names: `throw new InvalidOperationException(\"no dataset is open\")`",
      "a type named for what went wrong here: `class DatasetMissing : Exception { }`, then `throw new DatasetMissing(path)`",
      "keep the cause when you wrap one: `throw new DatasetMissing(path, error)`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "CS-TYPE:1",
    category: "TYPE",
    pass: "fast",
    bans: "the `!` that tells the compiler a value is not null",
    why:
      "the compiler worked out that this can be nothing, and `!` overrules it without checking. It is a promise made by whoever typed it, on a line somebody else will change next year. When the promise turns out to be false the program stops with a message naming this line, which is rarely where the empty value came from",
    instead: [
      "ask, and say what happens when it is nothing: `name?.Length ?? 0`",
      "check once at the top and let the rest of the method rely on it: `if (name is null) return;`",
      "if it genuinely cannot be null, make the type say so, so nobody has to trust a `!`",
      "in a test, `Assert.NotNull(held)` says the same thing and fails with a sentence rather than a crash",
    ],
    valve: { kind: "none" },
  },
  {
    id: "CS-TRUTH:1",
    category: "TRUTH",
    pass: "fast",
    bans: "`async void` on a method that is not an event handler",
    why:
      "nobody can wait for it and nobody can catch it. The caller carries on immediately, so work that has not finished looks finished, and a failure inside it does not reach the caller at all — it goes to whatever the runtime does with an unowned failure, which in a web application is usually the end of the process. An event handler is the one place the runtime demands this shape, which is why it is the one place allowed",
    instead: [
      "`async Task` instead of `async void`, so the caller can await it and see the failure",
      "if nothing is meant to wait, say so where it is started, and catch inside it: `_ = Run();` with a try around the body",
      "an event handler keeps `async void` — the shape `(object sender, EventArgs e)` is how this rule recognises one",
    ],
    valve: { kind: "none" },
  },
];

export function csharpRuleFor(id: string): Rule | undefined {
  return CSHARP_RULES.find((one) => one.id === id);
}
