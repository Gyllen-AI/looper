Changing something another program depends on.

- **A break is not only a width change.** Adding a value to a shipped enum moves
  no bytes and still breaks every reader built before it, because the old reader
  meets a tag it does not know. Widening the set of values a field can hold is a
  break in the same way widening the field is.
- **Two versions coexist for a window, and the window is stated.** Say which side
  deploys first and how long both must be understood. Reversed, the running
  version meets a message it cannot read, and the symptom is silence rather than
  an error.
- **A field is never repurposed.** Deprecate it, add a new one, delete the old
  when the last reader is gone. Reusing a name with a new meaning is a bug that
  only appears in the clients you cannot redeploy.
- **The version is on the message, not in the documentation.** A receiver that
  cannot tell which shape arrived is guessing, and it guesses wrong at exactly
  the moment you changed something.
- **A consumer you cannot redeploy sets the pace.** Anything running on somebody
  else's machine makes every change additive until it is gone.
