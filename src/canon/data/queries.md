Asking the database for something.

- **Count the round trips.** A page is one query with joins or a small fixed
  number, never one query per row. The loop that reads fine at ten rows is the
  incident at ten thousand, and it is invisible until then.
- **The database does the aggregation.** Counts, medians, folds and filters run
  where the data is. Fetching rows to add them up in application code moves the
  whole table across a socket to compute one number.
- **Nothing from outside is concatenated into a query.** A parameter is shorter
  to write than the spelling that gets the data stolen, and it is the only
  version where a value cannot become part of the command.
- **A transaction is as short as the work, and holds no network call.** A lock
  held across an HTTP request is a lock held for as long as somebody else's
  server feels like taking.
- **A read that must be consistent says so.** Deciding by reading twice, or by
  reading after writing without knowing which replica answered, is a bug that
  reproduces once a month and never in a test.
