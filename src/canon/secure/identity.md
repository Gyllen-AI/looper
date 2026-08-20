Who somebody is, and what they may do.

- **Authentication and authorisation are separate questions and separate code.**
  Knowing who someone is says nothing about what they may reach.
- **The check happens where the data is served, not where the button is drawn.**
  A hidden control is a hint; anything enforced only in an interface is enforced
  nowhere.
- **Deny by default.** A new route, field or action arrives closed and is opened
  deliberately.
- **The identity a request carries is proven, never asserted.** A user id in a
  body or a query string is a request to be somebody.
- **Every grant can be revoked, and the revocation takes effect.**
