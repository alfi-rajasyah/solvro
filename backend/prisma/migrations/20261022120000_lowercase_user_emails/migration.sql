-- docs/archive/plans/application-review-2026-10-22.md, F-13: `users.email` is UNIQUE but case-sensitive,
-- and only the Google sign-in path lower-cased before lookup. An account
-- created as `Alice@Corp.com` could not sign in with `alice@corp.com`, and a
-- Google sign-in for the same person auto-provisioned a second account.
-- From this migration on, every write path stores the lower-cased form.
--
-- Guard first: two existing rows that differ only by case cannot both be
-- lower-cased under the UNIQUE constraint. Abort with a clear message so an
-- operator merges them by hand instead of the deploy failing half-way.
DO $$
DECLARE
  clash TEXT;
BEGIN
  SELECT string_agg(dup.email, ', ')
    INTO clash
    FROM (
      SELECT lower(email) AS email
        FROM users
       GROUP BY lower(email)
      HAVING count(*) > 1
    ) AS dup;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'lowercase_user_emails: these emails exist in more than one case and must be merged first: %', clash;
  END IF;
END $$;

UPDATE users SET email = lower(email) WHERE email <> lower(email);
