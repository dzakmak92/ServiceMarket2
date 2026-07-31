-- Password reset.
--
-- There was no way back into an account. No forgot-password endpoint, no
-- token, no link on the sign-in page, and — until the previous commit — no
-- way to change a password even while signed in. Forgetting it meant
-- permanent lockout from your own invoices, tax year and customers, and a
-- leaked password could never be rotated.
--
-- Two decisions worth stating, because both are easy to get wrong and the
-- consequence of either is an account takeover.
--
-- **The token is stored hashed, never in the clear.** A reset token is a
-- bearer credential: whoever holds it becomes the account. Storing it
-- plaintext means a read of this table — a leaked backup, an over-broad
-- support query, a SQL injection anywhere else — hands over every account
-- with an outstanding reset. Only the SHA-256 of the token is kept, so the
-- table is useless to anyone who reads it; the clear value exists solely in
-- the email that was sent.
--
-- **Single use, and short lived.** `used_at` is set the moment a token is
-- redeemed and checked before every redemption, so a link that ends up in a
-- forwarded email or a shared inbox cannot be replayed. One hour is short
-- enough to bound the exposure and long enough for someone to find the mail.

create table if not exists password_reset_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,

  -- SHA-256 of the token. Not the token. See above.
  token_hash    text not null unique,

  expires_at    timestamptz not null,
  used_at       timestamptz,

  -- Kept for the abuse trail: who asked, and from where. An `inet` that the
  -- application validates before writing, so a forged X-Forwarded-For cannot
  -- make the insert fail and lose the request.
  requested_ip  inet,
  user_agent    text,

  created_at    timestamptz not null default now()
);

-- The redemption path looks up by hash; the request path counts recent rows
-- per user to throttle. Both want an index.
create index if not exists password_reset_user_idx
  on password_reset_tokens (user_id, created_at desc);

-- Expired and used tokens are swept by the same nightly job that purges
-- accounts, so this table does not grow without bound.
create index if not exists password_reset_expiry_idx
  on password_reset_tokens (expires_at)
  where used_at is null;
