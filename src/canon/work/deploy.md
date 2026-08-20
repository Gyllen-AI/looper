Getting a change onto the machine that runs it.

- **Deploying one half of a pair is the outage.** Anything that must agree on a
  version deploys together, in a stated order, and the tool refuses the order
  that breaks it.
- **A deploy from a stale checkout is silent and total.** Installing an older
  build over a newer one produces no error; compare before writing.
- **Never leave it half applied.** A step that installs and fails to restart
  leaves new code on disk and old code running. Each unit is handled alone and
  what could not be done is named.
- **Rolling back is a path somebody has walked**, not a plan first tested during
  an incident.
- **What is running is reviewable.** Shipping from a working copy nobody else
  can see means the running system exists in one place.
