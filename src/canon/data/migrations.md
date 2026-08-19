Changing the shape of data that already exists.

- **A migration that has been applied is immutable.** Not "should not be edited":
  cannot. Its checksum is what the database recorded, so editing a comment inside
  one breaks every deployment that already ran it. A correction is a new
  migration.
- **Additive first, in its own step.** Add the column, backfill it, start writing
  it, start reading it, then drop the old one. Five steps, each deployable alone,
  each reversible. A rename in one step is an outage for as long as the deploy
  takes.
- **The order between a schema change and the code that needs it is load-bearing
  and belongs in writing.** Migrations first when the change is additive, code
  first when it stops writing something. Reversed, the running version meets a
  table it does not expect.
- **A migration that cannot be run twice is a migration that will fail once.**
  Write them so a repeat is a no-op.
- **No migration deletes data on the way past.** Dropping a column is its own
  deliberate step, after the last reader is gone and named in the commit.
