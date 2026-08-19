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
    id: "CS-ERROR:3",
    category: "ERROR",
    pass: "fast",
    bans:
      "a `catch` that names nothing and answers with an invented value — `return null`, `return 0`, `return false`, `return new List<T>()`, `return Array.Empty<T>()`",
    why:
      "the caller cannot tell that answer from a real one. An empty list means \"there were none\" everywhere else in the program, so a failure to read becomes a fact about the data one line later, and whoever debugs it starts from the wrong end. Naming the failure is what makes the same `return false` honest: `catch (OperationCanceledException) { return false; }` says which thing did not happen",
    instead: [
      "name the one failure this answer belongs to: `catch (FileNotFoundException) { return Array.Empty<string>(); }`",
      "write it down first, so the invented value is not the only trace: `catch (Exception error) { _logger.LogWarning(error, \"could not read {Path}\", path); return null; }`",
      "throw instead of answering: `catch (IOException error) { throw new DatasetMissing(path, error); }`",
      "a method named `TryX` returning `bool` is the shape where `false` is the contract, and this rule leaves it alone",
    ],
    valve: { kind: "none" },
  },
  {
    id: "CS-ERROR:4",
    category: "ERROR",
    pass: "fast",
    bans:
      "a `catch` that names nothing, does something, and never looks at what it caught — no rethrow, no logger, no use of the caught value",
    why:
      "this is the shape that reads as handled and is not. Something happens in the block, so it does not look empty, but the failure itself leaves no trace: not in a log, not in what the method returns, not in the exception being passed on. The next person sees a `catch` with code in it and assumes somebody thought about it",
    instead: [
      "look at it, which is enough: `catch (Exception error) { _lastFailure = error.Message; }`",
      "write it down: `catch (Exception error) { _logger.LogWarning(error, \"import failed\"); Reset(); }`",
      "name which failure this recovery is for, and the rule stops asking: `catch (OperationCanceledException) { ready = false; }`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "CS-LOG:1",
    category: "LOG",
    pass: "fast",
    bans:
      "`Console.WriteLine` and the rest of the `Console` family, outside the file that starts the program",
    why:
      "the program's output belongs to whoever ran it — a pipe, a file, another program reading it. A library writing to it puts its own noise in somebody else's stream, and the line cannot be turned off, filtered, given a level, or tied to the request it came from. A logger can do all four",
    instead: [
      "`_logger.LogInformation(\"imported {Count} rows\", count)`, which can be filtered and switched off",
      "for a failure, `_logger.LogWarning(error, \"could not read {Path}\", path)`",
      "the file that starts the program keeps `Console` — an entry point, or a file beginning `#!`, is exempt in full",
    ],
    valve: { kind: "none" },
  },
  {
    id: "CS-SECURITY:1",
    category: "SECURITY",
    pass: "fast",
    bans:
      "building a query by pasting values into its text — an interpolated string or a `+` chain that reads as SQL and carries something that is not a literal",
    why:
      "whatever is pasted in stops being a value and becomes part of the command. A name with a quote in it ends the string early and the rest is read as instructions, which is how a search box deletes a table. This is true of a column name as much as a search term: the database cannot tell which parts you meant as commands",
    instead: [
      "let the value travel as a parameter: `\"WHERE id = @id\"` with `cmd.Parameters.AddWithValue(\"@id\", id)`",
      "if it is a column or table name, which cannot be a parameter, check it against a list you wrote rather than against a pattern",
      "an ORM that builds the command for you — the query text stops being a string you assemble",
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

export type Known =
  | { readonly kind: "known"; readonly rule: Rule }
  | { readonly kind: "unknown" };

export function csharpRuleFor(id: string): Known {
  const held = CSHARP_RULES.find((one) => one.id === id);
  return held === undefined ? { kind: "unknown" } : { kind: "known", rule: held };
}
