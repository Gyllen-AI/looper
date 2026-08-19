Everything that arrives from outside.

- **Validate at the edge, then the type is earned rather than claimed.** A value
  checked where it enters can be trusted everywhere after; one trusted on arrival
  has to be re-checked forever, and one day is not.
- **Nothing from outside is pasted into a query, a shell command, or a page.**
  Whoever sent it chose what it says. A parameter, an argument array and a schema
  at the edge are each shorter to write than the spelling that gets you robbed.
- **Size and shape are validated before content.** An unbounded body, an
  unbounded list and an unbounded string are three ways to spend all the memory
  on one request.
- **A parser is not a validator.** That the bytes decoded says nothing about
  whether the values are allowed.
- **Reject rather than repair.** Quietly correcting malformed input teaches the
  sender that it works and hides the day it means something else.
