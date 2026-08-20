Making a query fast before it is slow.

- **An index exists before the query that needs it.** Decide it when the
  `WHERE`, `JOIN` or `ORDER BY` is written; adding it later is a lock on a grown
  table at the worst hour.
- **Every foreign key is indexed on the child side.** The database does not do
  it for you.
- **A composite index is ordered by what the query filters first, equality
  before range.** `(status, created_at)` answers a filter on status sorted by
  time; the reverse answers neither well.
- **Read the plan.** An index that is not used is a write cost with no read
  benefit, paid forever.
- **Every list has a limit, enforced where the query is built.** A query with no
  bound will one day return the whole table.
