Writing down what happened, for whoever asks later.

- **A log line is a question somebody will ask, so write it as fields.** The
  message is a constant and everything that varies sits beside it. That is what
  makes a log something you can count and filter rather than reread.
- **Emit where the program crosses a boundary it does not control**: a process
  starts, a connection opens, a request is answered, a job fires. Between those,
  silence is correct, and a line on every iteration is a line nobody reads.
- **Whatever ties lines to one request belongs on all of them.** Fifteen true
  lines nobody can join are worth less than three carrying the same id.
- **A log nobody collects is a `catch` with more steps.** Writing a warning into
  a process whose output reaches no one deletes the evidence just as thoroughly,
  and looks responsible while doing it.
- **A secret never reaches a log line.** One in a log is an incident, not a bug,
  and the fix begins at whoever issued the credential.
