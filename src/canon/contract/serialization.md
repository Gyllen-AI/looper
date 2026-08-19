The shape that crosses between programs.

- **Every wire shape is defined once and generated everywhere else.** A type
  hand-written beside the schema that already describes it is a divergence with a
  date on it.
- **Absent, null and empty are three different things, so pick which you mean.**
  A field that is missing, a field that is present and null, and an empty list
  are distinguishable on the wire, and a reader that treats them alike will be
  wrong about one of them.
- **An unknown value is kept, not dropped.** A reader that discards a field it
  does not recognise cannot round-trip, and the writer's newer version silently
  loses data through it.
- **Names on the wire are part of the contract**, so renaming a field is a break
  even when the type is identical.
- **Numbers that must be exact are not floats.** Money, identifiers and counters
  cross as integers or strings, because a float is an approximation that looks
  like a value.
