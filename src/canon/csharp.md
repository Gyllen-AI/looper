Writing C# in a governed project, Razor components included. The compiler already
refuses most of what it can see, so these are the failures it lets through — and
in a Razor file, the half of the code the tooling barely looks at.

- A caught failure leaves through one of three doors: thrown onward, returned to
  the caller, or written down where somebody will read it. `catch { }` uses none
  of them, and a comment inside the braces is not a fourth door — the person
  reading the log at two in the morning cannot see it.
- An error is a type of your own, one per failure. `throw new Exception("...")`
  names nothing, so every caller above catches the same thing and none of them
  can tell a missing file from a refused password.
- `async void` cannot be awaited and its failures reach nobody. Work that has not
  finished looks finished, and the exception goes wherever the runtime puts an
  unowned one, which in a web application is usually the end of the process.
  `async Task` everywhere except an event handler, where the runtime demands the
  other shape.
- A query built by joining strings is a query somebody else can finish writing.
  Parameters are not a style preference: `WHERE id = @id` is the only version
  where the value cannot become part of the command.
- In a Razor file, the markup is a view of state that already arrived. A screen
  that draws before the answer comes back is lying for exactly as long as it
  takes to be wrong.
- No comments, for the reason every language here has: names, types and tests
  cannot drift out of date, and prose can.
