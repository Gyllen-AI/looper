Asking the database for something.

- **Count the round trips.** A page is one query with joins or a small fixed
  number, never one per row.
- **The database does the aggregation.** Fetching rows to add them up moves the
  table across a socket to compute one number.
- **Nothing from outside is concatenated into a query.** A parameter is the only
  spelling where a value cannot become part of the command.
- **A transaction is as short as the work and holds no network call.**
- **A read that must be consistent says so.** Read twice, or read after write on
  an unknown replica, and the bug reproduces monthly and never in a test.
