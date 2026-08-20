Everything that arrives from outside.

- **Validate at the edge, then the type is earned rather than claimed.** A value
  checked where it enters is trusted everywhere after; one trusted on arrival is
  re-checked forever, and one day is not.
- **Nothing from outside is pasted into a query, a shell command, or a page.** A
  parameter, an argument array and a schema at the edge.
- **Size and shape are validated before content.** An unbounded body, list or
  string is a way to spend all the memory on one request.
- **A parser is not a validator.** Decoded says nothing about allowed.
- **Reject rather than repair.** Quietly correcting malformed input hides the day
  it means something else.
