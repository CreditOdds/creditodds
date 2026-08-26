// Referral expiry notification email.
//
// Sent by the referral validator (referral-validation-complete) when one or
// more of a user's links are auto-archived in a validation run. One email per
// user per run: it lists every card whose link is currently stale and
// unreplaced, not just the ones archived this run, so a user with two dead
// links gets a single email naming both. A link only crosses the archive
// threshold once (archived rows are skipped by later runs), so a user is
// never re-emailed about the same link.
//
// Requires BREVO_API_KEY + BREVO_SENDER_EMAIL (stack params BrevoApiKey /
// BrevoSenderEmail) and FIREBASE_SERVICE_ACCOUNT_B64 for the uid -> email
// lookup. No-ops with a log line when any of those are missing. This is a
// service notice about the user's own submitted content, not marketing, so it
// intentionally does not consult the newsletter unsubscribe list.

const mysql = require("../db");
const brevo = require("./brevo");
const { initFirebase } = require("./firebase-init");

const PROFILE_URL = "https://www.creditodds.com/profile";

function isEnabled() {
  return brevo.canSendTransactional() && Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64);
}

// Cards (not links) belonging to this user whose referral was auto-archived
// by the validator, has no active replacement, and was not dismissed by the
// user (dismissal rewrites the reason prefix to `dismissed-auto:`).
async function getStaleCardsForSubmitter(submitterId) {
  return mysql.query(
    `
    SELECT c.card_name, MAX(r.last_validated_at) AS flagged_at
    FROM referrals r
    JOIN cards c ON c.card_id = r.card_id
    WHERE r.submitter_id = ?
      AND r.archived_at IS NOT NULL
      AND r.archived_reason LIKE 'auto:%'
      AND NOT EXISTS (
        SELECT 1 FROM referrals r2
        WHERE r2.submitter_id = r.submitter_id
          AND r2.card_id = r.card_id
          AND r2.archived_at IS NULL
      )
    GROUP BY c.card_id, c.card_name
    ORDER BY flagged_at DESC
    `,
    [submitterId],
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmail(cardNames) {
  const many = cardNames.length > 1;
  const subject = many
    ? `${cardNames.length} of your CreditOdds referral links stopped working`
    : `Your ${cardNames[0]} referral link stopped working`;

  const intro = many
    ? "Our automated link check could no longer open these referral links, so we have stopped showing them on card pages:"
    : "Our automated link check could no longer open your referral link, so we have stopped showing it on the card page:";

  const textContent = [
    "Hi,",
    "",
    intro,
    "",
    ...cardNames.map((n) => `  - ${n}`),
    "",
    "Issuers rotate or retire referral links from time to time, so this is normal. If you have a fresh link, you can add a replacement from the Referrals tab of your profile. If you would rather not replace it, you can dismiss the notice there instead:",
    "",
    PROFILE_URL,
    "",
    "Any impressions and clicks the old links earned stay on your profile.",
    "",
    "CreditOdds",
  ].join("\n");

  const htmlContent = `
<p>Hi,</p>
<p>${escapeHtml(intro)}</p>
<ul>
${cardNames.map((n) => `  <li>${escapeHtml(n)}</li>`).join("\n")}
</ul>
<p>Issuers rotate or retire referral links from time to time, so this is normal. If you have a fresh link, you can add a replacement from the Referrals tab of your profile. If you would rather not replace it, you can dismiss the notice there instead.</p>
<p><a href="${PROFILE_URL}">Open your profile</a></p>
<p>Any impressions and clicks the old links earned stay on your profile.</p>
<p>CreditOdds</p>
`.trim();

  return { subject, textContent, htmlContent };
}

// Sends one notification email to the given submitter. Returns a small
// status object for logging; throws only on unexpected coding errors, since
// the caller treats notification as best-effort.
async function sendExpiryNotification(submitterId) {
  const staleCards = await getStaleCardsForSubmitter(submitterId);
  if (staleCards.length === 0) {
    // The newly archived link was already replaced or dismissed between the
    // archive UPDATE and this query. Nothing worth emailing about.
    return { sent: false, reason: "no stale cards" };
  }

  let email;
  try {
    const user = await initFirebase().auth().getUser(submitterId);
    if (user.disabled) return { sent: false, reason: "user disabled" };
    email = user.email;
  } catch (err) {
    console.error(`referral-expiry-email: getUser(${submitterId}) failed:`, err.message);
    return { sent: false, reason: "firebase lookup failed" };
  }
  if (!email) return { sent: false, reason: "no email on account" };

  const cardNames = staleCards.map((c) => c.card_name);
  const { subject, textContent, htmlContent } = buildEmail(cardNames);
  try {
    await brevo.sendTransactionalEmail({ to: email, subject, textContent, htmlContent });
  } catch (err) {
    console.error(`referral-expiry-email: send to uid ${submitterId} failed:`, err.message);
    return { sent: false, reason: "brevo send failed" };
  }
  return { sent: true, cardNames };
}

module.exports = { isEnabled, sendExpiryNotification };
