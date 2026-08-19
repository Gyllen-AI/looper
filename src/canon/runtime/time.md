Clocks, ordering, and doing a thing exactly once.

- **One clock decides.** A timestamp from a caller is a claim, not a fact: it can
  be wrong, skewed or forged. Record when you received it and, if the caller's
  time matters, keep both under different names.
- **Every write that can be retried is idempotent, or it is a duplicate waiting
  for a timeout.** A retry is not an exception, it is the normal behaviour of
  every network. The key that makes it safe is chosen by the caller and stored.
- **At-least-once is what you get, so exactly-once is something you build.**
  Anything that charges money, sends a message or moves stock is written against
  a key that makes the second delivery a no-op.
- **Ordering is not delivery order.** If two events must be applied in sequence,
  they carry something that says so. Arrival order is an accident of routing.
- **A deadline is part of the request.** A call with no timeout is a call that can
  hang until the process is restarted, holding whatever it held.
