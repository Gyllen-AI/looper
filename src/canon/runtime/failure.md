What happens when something you depend on is down.

- **Degraded and lying are different, and the difference is visible.** A screen
  that cannot reach a service says so. A screen that shows the last value it saw
  without saying it is old has lied, and the reader acts on it.
- **A failure that is retried is retried with a ceiling and a backoff.** An
  immediate infinite retry turns one sick service into two, and the second one is
  yours.
- **Absence is a state with a name.** Unknown is not empty and not zero. A count
  that could not be fetched must not render as `0`, because nobody can tell that
  apart from a real zero.
- **A fallback that invents a value is worse than an error.** Defaults belong
  where settings are gathered; a default invented at the point of failure is a
  wrong answer nobody can trace.
- **Say what you will do when the dependency is gone, before you add it.** A
  dependency with no answer to that question is a single point of failure that
  nobody has agreed to.
- **An error propagates, crashes, or is observed. None of them vanish.** A
  swallowed error is a failure that already happened and that nobody will ever be
  told about.
