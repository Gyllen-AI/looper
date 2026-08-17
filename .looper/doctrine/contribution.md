Changing a rule, here or in a fork that will send it back.

- The cases come first, written from the rule's own ban text into
  `audit/cases.ts`: what must fire, what must stay silent. A test written after
  the code can only agree with the code, which is how ten rules once shipped
  saying less than they did.
- A rule is not done until it has been run over code nobody here wrote. Any
  `node_modules` or `~/.cargo/registry` is fifty thousand lines of somebody
  else's work; judge every hit by hand and say how many you looked at.
- Send the evidence with the change, not the conclusion: the corpus, the count,
  the false positives you found and what you did about them. A rule with
  evidence behind it is taken; one that only sounds right is not.
