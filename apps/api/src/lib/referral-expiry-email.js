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
    SELECT c.card_name, c.card_image_link, MAX(r.last_validated_at) AS flagged_at
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
    GROUP BY c.card_id, c.card_name, c.card_image_link
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

// Font stacks and palette mirror the newsletter templates in
// creditodds-newsletters/ so every email from us looks like one family.
// Everything critical is inlined; the <style> block (with the Google Fonts
// @import) is progressive enhancement only, since Gmail strips @import and
// most clients drop <head> styles.
const FONT_BODY = "'Inter',Helvetica,Arial,sans-serif";
const FONT_HEAD = "'Inter Tight','Inter',Helvetica,Arial,sans-serif";

// Same public CDN the site's CardImage component uses; card_image_link in the
// DB is the bare filename. Absolute URLs are required in email clients.
const CARD_IMAGE_CDN = "https://d3ay3etzd1512y.cloudfront.net/card_images";

// cards: [{ card_name, card_image_link }] — card_image_link may be null, in
// which case the row falls back to the newsletter-style purple dot.
function buildEmail(cards) {
  const cardNames = cards.map((c) => c.card_name);
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

  const headline = many
    ? `${cardNames.length} of your referral links stopped working`
    : `Your ${escapeHtml(cardNames[0])} referral link stopped working`;

  const preheader = many
    ? "Our link check could no longer open these referral links. Add replacements or dismiss the notice from your profile."
    : "Our link check could no longer open your referral link. Add a replacement or dismiss the notice from your profile.";

  // One row per card: card art thumbnail next to the bold card name. The
  // thumbnail is built to fail gracefully when a client blocks or cannot
  // load remote images: fixed 64x40 box with a lavender background and
  // rounded corners renders as a clean card-shaped chip instead of a torn
  // icon, and alt is intentionally empty because the card name is already
  // real text in the adjacent cell (the image is decorative). object-fit
  // keeps off-ratio art unstretched in clients that support it; Outlook
  // ignores it and the stretch is imperceptible at this size. Cards without
  // art keep the newsletter-style purple dot.
  const cardRows = cards
    .map((c) => {
      const name = escapeHtml(c.card_name);
      const thumb = c.card_image_link
        ? `<img src="${CARD_IMAGE_CDN}/${escapeHtml(c.card_image_link)}" width="64" height="40" alt="" style="display:block;width:64px;height:40px;object-fit:contain;border:0;border-radius:4px;background-color:#f0e9ff;font-size:0;line-height:0;color:transparent;">`
        : `<div style="width:14px;height:14px;border-radius:50%;background-color:#6d3fe8;font-size:0;line-height:0;">&nbsp;</div>`;
      return `<tr><td valign="middle" width="78" style="padding:0 14px 12px 0;">${thumb}</td><td valign="middle" style="font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:#1a1330;font-weight:600;padding:0 0 12px;">${name}</td></tr>`;
    })
    .join("\n        ");

  const htmlContent = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  /* Progressive enhancement only - all critical styles are inlined.
     Gmail ignores @import and CSS variables, so none are used below. */
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  body{margin:0;padding:0;}
  @media (max-width:600px){
    .px{padding-left:20px!important;padding-right:20px!important;}
    .h1{font-size:24px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f7f5fc;">
<div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f5fc;">
<tr><td align="center" style="padding:24px 12px;">

  <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background-color:#ffffff;border:1px solid #ece8f5;border-radius:16px;">

    <!-- MASTHEAD -->
    <tr><td class="px" style="padding:22px 32px;border-bottom:1px solid #ece8f5;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left" style="font-family:${FONT_HEAD};">
            <a href="https://creditodds.com" style="font-weight:700;font-size:20px;letter-spacing:-0.02em;color:#1a1330;text-decoration:none;">credit<span style="color:#6d3fe8;">odds</span></a>
          </td>
          <td align="right" style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#6b6384;">Referral Update</td>
        </tr>
      </table>
    </td></tr>

    <!-- BODY -->
    <tr><td class="px" style="padding:32px;">
      <p style="font-family:${FONT_BODY};font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6d3fe8;margin:0 0 10px;">Your Referral Links</p>
      <h1 class="h1" style="font-family:${FONT_HEAD};font-weight:700;font-size:28px;line-height:1.2;letter-spacing:-0.02em;color:#1a1330;margin:0 0 16px;">${headline}</h1>

      <p style="font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:#3a2f55;margin:0 0 14px;">${escapeHtml(intro)}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
        ${cardRows}
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td style="background-color:#f7f5fc;border:1px solid #ddd7ec;border-left:3px solid #6d3fe8;border-radius:8px;padding:14px 16px;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:#3a2f55;"><strong style="color:#1a1330;">This is normal.</strong> Issuers rotate and retire referral links all the time. Any impressions and clicks the old ${many ? "links" : "link"} earned stay on your profile.</td></tr></table>

      <p style="font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:#3a2f55;margin:0 0 18px;">If you have a fresh link, add a replacement from the Referrals tab of your profile. If you would rather not replace it, you can dismiss the notice there instead.</p>

      <a href="${PROFILE_URL}" style="display:inline-block;background-color:#6d3fe8;color:#ffffff;text-decoration:none;font-family:${FONT_HEAD};font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;">Open Your Referrals &#8594;</a>

      <p style="font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:#3a2f55;margin:26px 0 0;">&#8212; The CreditOdds Team</p>
    </td></tr>

    <!-- FOOTER -->
    <tr><td class="px" style="padding:24px 32px 30px;border-top:1px solid #ece8f5;background-color:#f7f5fc;border-radius:0 0 16px 16px;">
      <p style="font-family:${FONT_BODY};font-size:12px;color:#6b6384;line-height:1.6;margin:0 0 10px;text-align:center;">You're receiving this service notice because you <strong style="color:#1a1330;">submitted a referral link</strong> at creditodds.com. We only send it when one of your links stops working.</p>
      <p style="font-family:${FONT_BODY};font-size:11px;color:#a49fb8;line-height:1.6;margin:0;text-align:center;">CreditOdds &#183; 400 E 75th St, New York, NY &#183; <a href="https://creditodds.com/privacy" style="color:#6b6384;">Privacy Policy</a></p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

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

  const { subject, textContent, htmlContent } = buildEmail(staleCards);
  try {
    await brevo.sendTransactionalEmail({ to: email, subject, textContent, htmlContent });
  } catch (err) {
    console.error(`referral-expiry-email: send to uid ${submitterId} failed:`, err.message);
    return { sent: false, reason: "brevo send failed" };
  }
  return { sent: true, cardNames: staleCards.map((c) => c.card_name) };
}

module.exports = { isEnabled, sendExpiryNotification };
