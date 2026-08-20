The shape that crosses between programs.

- **Every wire shape is defined once and generated everywhere else.** A type
  hand-written beside the schema that describes it is a divergence with a date on
  it.
- **Absent, null and empty are three different things, so pick which you mean.**
  A reader that treats them alike is wrong about one of them.
- **An unknown value is kept, not dropped**, or the writer's newer version loses
  data through you.
- **Names on the wire are the contract.** Renaming a field is a break even with
  the type unchanged.
- **Numbers that must be exact are not floats.** Money, identifiers and counters
  cross as integers or strings.
