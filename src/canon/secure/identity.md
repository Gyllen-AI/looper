Who somebody is, and what they may do.

- **Authentication and authorisation are separate questions and separate code.**
  Knowing who someone is says nothing about what they may reach, and a system
  that conflates them grants by accident.
- **The check happens where the data is served, not where the button is drawn.**
  A hidden control is a hint. Anything enforced only in an interface is enforced
  nowhere, because the request can be made without it.
- **Deny by default.** A new route, a new field, a new action arrives closed and
  is opened deliberately. Anything else means every addition is a potential leak
  nobody reviewed.
- **The identity a request carries is proven, never asserted.** A user id in a
  body or a query string is a request to be somebody, not evidence of being them.
- **Every grant can be revoked, and the revocation takes effect.** A token with
  no expiry and no revocation is a permanent key you cannot take back.
