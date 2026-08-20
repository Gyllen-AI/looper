Changing the shape of data that already exists.

- **An applied migration is immutable.** Its checksum is what the database
  recorded; a correction is a new migration.
- **Additive first, in its own step:** add the column, backfill, write it, read
  it, drop the old one. Five deployable steps. A rename in one step is an outage
  as long as the deploy.
- **The order between a schema change and the code that needs it is written
  down:** migration first when additive, code first when it stops writing
  something.
- **A migration runs twice as a no-op**, or it fails once.
- **No migration deletes data on the way past.** Dropping a column is its own
  step, after the last reader is gone, named in the commit.
