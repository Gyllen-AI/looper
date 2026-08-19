Shaping the tables that outlive the code.

- **A row records that something happened, so it carries when.** A table whose
  rows can be changed in place has no history and no way to answer "what did we
  believe on Tuesday". Prefer appending a new row to editing an old one, and
  where a row must change, keep `created_at` and `updated_at` rather than one
  ambiguous timestamp.
- **Absence has one spelling.** Pick `NULL` or a sentinel, never both, and never
  a magic number: a column where `0`, `-1` and `NULL` all mean "unknown" is a
  column nobody can aggregate.
- **A constraint the database can enforce is not a check in application code.**
  Foreign keys, `NOT NULL`, `UNIQUE` and `CHECK` hold against every writer,
  including the one somebody adds next year and the console somebody opens at
  two in the morning. Application validation holds against one caller.
- **A type is the narrowest one that fits.** Money is never a float, an
  identifier is never a bare string when the language has a type for it, and an
  enum stored as free text is a set nobody can enumerate later.
- **Deleting is an event, not an absence.** Mark it and keep the row, because a
  deleted row is the evidence for the question somebody asks after the deletion.
