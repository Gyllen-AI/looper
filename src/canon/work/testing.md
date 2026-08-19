Proving a thing does what it says.

- **A test written after the code can only agree with the code.** Write what must
  fire and what must stay silent from the requirement, then make it pass.
- **Never against fabricated data.** A fixture invented to make a test green
  proves the test, not the system, and it is indistinguishable from a real case
  the moment anyone reasons from it.
- **A test that cannot fail is a comment.** Delete it or make it able to fail.
- **The bug that escaped gets a test before it gets a fix**, or the same bug
  returns under a different name.
- **Test the boundary you do not control**, not the language. Asserting that
  addition works costs a suite its credibility.
