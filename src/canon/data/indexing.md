Making a query fast before it is slow.

- **An index exists before the query that needs it, not after the incident.** The
  moment a `WHERE`, `JOIN` or `ORDER BY` is written is the moment its index is
  decided. Adding one later means a table lock on a table that has grown, at the
  worst hour, under load.
- **Every foreign key is indexed on the child side.** The database does not do it
  for you, and the missing one only shows up as a table scan on delete when the
  parent table is finally large.
- **A composite index is ordered by what the query filters first**, equality
  before range. An index on `(status, created_at)` answers a query that filters
  status and sorts by time; the reverse answers neither well.
- **Say what a query is expected to cost, and check it.** Read the plan. An index
  that is not used is a write cost with no read benefit, and every write pays it
  forever.
- **A query with no bound is a query that will one day return the whole table.**
  Every list has a limit, and the limit is enforced where the query is built, not
  where the results are shown.
