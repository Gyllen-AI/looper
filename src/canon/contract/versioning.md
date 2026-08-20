Changing something another program depends on.

- **A break is not only a width change.** Adding a value to a shipped enum moves
  no bytes and still breaks every reader built before it.
- **Two versions coexist for a window, and the window is stated:** which side
  deploys first, how long both must be understood. Reversed, the symptom is
  silence rather than an error.
- **A field is never repurposed.** Deprecate it, add a new one, delete the old
  when the last reader is gone.
- **The version is on the message, not in the documentation.**
- **A consumer you cannot redeploy sets the pace:** every change is additive
  until it is gone.
