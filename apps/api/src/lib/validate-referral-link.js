// Server-side guard for user/admin-submitted referral links.
//
// An approved referral_link is rendered as an <a href> on public card pages, so
// an unchecked value is both a link-injection vector (javascript:/data: schemes)
// and a storage-abuse vector (unbounded length). ReferralModal.validateUrl
// mirrors these rules in the browser, but the API is the real trust boundary —
// the frontend check is bypassable.
const MAX_LENGTH = 2048;

// Returns an error message string if invalid, or null if the link is acceptable.
function validateReferralLink(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "referral_link is required";
  }
  if (value.length > MAX_LENGTH) {
    return `referral_link cannot be more than ${MAX_LENGTH} characters`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return "referral_link must be a valid URL";
  }

  // https only: blocks javascript:/data:/http: schemes from ever reaching an href.
  if (url.protocol !== "https:") {
    return "referral_link must use https";
  }

  return null;
}

module.exports = { validateReferralLink, MAX_LENGTH };
