# 0011 — Accounts and sessions

Date: 2026-10-26 · Status: Accepted · Details: 0006

## Decision

- **Passwords**: argon2id via Node's built-in `crypto.argon2` (no native module), OWASP minimum
  parameters (19 MiB, 2 passes, 1 lane), stored as PHC strings so parameters can be raised later
  without invalidating existing hashes.
- **Sessions**: 32 random bytes (base64url) in the `agendina_session` cookie — `HttpOnly`,
  `SameSite=Lax`, `Path=/`, `Secure` when the request is HTTPS (directly or via
  `X-Forwarded-Proto`). Only the SHA-256 of the token is stored. 30-day lifetime, renewed to the
  full lifetime when used with less than 15 days left.
- **First user = admin**: a unique `instance_settings` row is claimed inside the signup
  transaction, so concurrent first signups cannot create two admins (verified on Postgres with
  overlapping transactions). After that, signup is closed until the admin opens it.
- **Login**: wrong password and unknown email return the same `401 invalid_credentials` and take the
  same time (a dummy hash is verified for unknown emails). 10 failures per email in 15 minutes →
  `429 too_many_attempts` (in memory, per process).
- **CSRF**: Hono's origin check for form-like requests; the API only accepts JSON bodies.
- **Errors**: every non-2xx response is `{ "error": "<code>" }`.

## Consequences

- The login limiter resets on restart and is per process; a multi-instance hosted deployment
  needs a shared store.
- Behind a TLS-terminating proxy, the proxy must send `X-Forwarded-Proto: https` for the cookie to
  be marked `Secure`.
