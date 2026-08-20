Shaping the tables that outlive the code.

- **A row records that something happened, so it carries when.** Prefer
  appending to editing; where a row must change, keep `created_at` and
  `updated_at`.
- **Absence has one spelling.** `NULL` or a sentinel, never both. A column where
  `0`, `-1` and `NULL` all mean unknown cannot be aggregated.
- **A constraint the database can enforce is not a check in application code.**
  Foreign keys, `NOT NULL`, `UNIQUE` and `CHECK` hold against every writer,
  including next year's.
- **A type is the narrowest one that fits.** Money is never a float, an
  identifier is never a bare string, an enum stored as free text is a set nobody
  can enumerate.
- **Deleting is an event, not an absence.** Mark it and keep the row.
