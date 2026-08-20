Chasing a fault you cannot yet see.

- **Add the logging before you chase the fault.** Instrument the path first and
  then go looking. Without it every attempt is a guess, and a guess that happens
  to work teaches nothing about what was wrong.
- **Rare is not fixed.** A fault that got less frequent with no cause named is
  the same fault with worse odds of being caught. Say it is rare and say the
  cause is unknown in the same breath, or the next reader will read it as closed.
- **Keep the reproduction.** A fault you cannot summon on purpose is a fault you
  cannot prove gone, and the cost of finding how to summon it is paid once.
- **One change at a time.** Two at once and you do not know which worked, which
  is how luck gets written down as a cause and shipped as a fix.
- **A fix is finished when the failure does not happen under the thing that
  produced it.** Nobody reporting it again is not evidence: nobody looked.
