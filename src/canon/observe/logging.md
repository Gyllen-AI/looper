Writing down what happened, for whoever asks later.

- **A log line is a question somebody will ask, so write it as fields.** The
  message is a constant and everything that varies sits beside it.
- **Emit where the program crosses a boundary it does not control:** a process
  starts, a connection opens, a request is answered, a job fires. Between those,
  silence is correct.
- **Whatever ties lines to one request belongs on all of them.**
- **A log nobody collects is a `catch` with more steps.** A warning written where
  no one reads deletes the evidence and looks responsible doing it.
- **A secret never reaches a log line.** One in a log is an incident, and the
  fix begins at whoever issued the credential.
