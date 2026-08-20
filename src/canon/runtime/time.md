Clocks, ordering, and doing a thing exactly once.

- **One clock decides.** A caller's timestamp is a claim: record when you
  received it, and keep both under different names if the caller's matters.
- **Every write that can be retried is idempotent**, keyed by the caller, or it
  is a duplicate waiting for a timeout.
- **At-least-once is what you get, so exactly-once is something you build:**
  anything that charges, sends or moves stock is written against a key that
  makes the second delivery a no-op.
- **Ordering is not delivery order.** Two events that must apply in sequence
  carry something that says so.
- **A deadline is part of the request.** A call with no timeout can hang until
  the process restarts, holding whatever it held.
