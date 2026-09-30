# Incident response — personal-data breach

A short runbook for a suspected or confirmed breach of personal data (unauthorised access,
loss, disclosure, or destruction). Written for a solo operator. Keep it boring and fast.

**Privacy contact:** privacy@thatfridge.com · **Operator:** Muhammad Naufal Kamaruddin

---

## 1. Contain (first hour)

- Rotate every credential that could be involved: DB password, `APP_KEY`, API tokens
  (OpenRouter, fal.ai, RevenueCat, Expo), SSH keys, the deploy key.
- If the API is actively leaking, take it offline (`php artisan down` on the VPS, or stop nginx)
  rather than leave it exposed.
- Revoke Sanctum tokens if account takeover is plausible: `DB::table('personal_access_tokens')->delete()`
  forces every device to re-authenticate.
- Snapshot the VPS and preserve logs (`/var/www/thatfridge/backend/storage/logs`, nginx access
  logs) before you change anything else — you need them for the assessment.

## 2. Assess (same day)

Answer, in writing (a dated note is enough):

| Question | |
|---|---|
| What happened, and when did it start / when noticed? | |
| Which data? (emails, hashed passwords, chat content, photos, usage history …) | |
| How many users, and which storefronts / countries? | |
| Is the data encrypted / hashed, or readable? | |
| Is there a real risk of harm — identity theft, account takeover, exposure of private content? | |
| Is it contained now? | |

Passwords are bcrypt-hashed and payment data never touches our servers (Apple handles it), so
those two are low-risk by design. Chat messages, photos and email addresses are the sensitive
classes.

## 3. Notify

Notify **without unreasonable delay** once you have the facts. Decisions by market:

- **Malaysia (PDPA).** If the breach causes or is likely to cause **significant harm**, notify
  the Personal Data Protection Commissioner (pdp.gov.my) and the affected users. Even below that
  bar, notify users if it's the right thing to do.
- **UK / Switzerland.** If in scope and the breach is likely to risk people's rights: notify the
  ICO (uk) / FDPIC (ch) within **72 hours** of becoming aware, and affected users if the risk is
  high. We are not established in either country, but the obligation can still apply.
- **South Korea (PIPA)** — only if a KR storefront is live: notify affected users and the PIPC
  promptly (PIPA expects notice within about 72 hours), with the required particulars.
- **Apple.** No formal breach-notification duty to Apple, but if the app itself is compromised,
  expect to ship a fixed build and may need to explain in App Review.

User notice should say: what happened, what data, what you've done, what they should do (e.g.
change password, watch for phishing), and the privacy contact.

## 4. Record & close

- Keep a dated incident record: timeline, data involved, who was notified and when, root cause,
  fix. Retain it (breach-record obligations run for years in several regimes).
- Ship the permanent fix and a regression check.
- If a systemic gap caused it, add the mitigation to `SETUP_TROUBLESHOOTING.md`.
