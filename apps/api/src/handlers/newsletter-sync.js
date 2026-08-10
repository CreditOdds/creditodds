// newsletter-sync — mirrors Firebase Auth users into the Brevo newsletter list.
//
// Runs on a daily EventBridge schedule (and can be invoked manually for a
// backfill — the sync is idempotent, so backfill and incremental runs are the
// same code path):
//   1. Lists every Firebase user with an email (skipping disabled accounts).
//   2. Upserts each into the Brevo newsletter list. Upserts never touch
//      emailBlacklisted, so anyone who unsubscribed stays unsubscribed.
//   3. Removes list members whose email no longer exists in Firebase
//      (account deleted) — removed from the list only, not deleted from
//      Brevo, so their unsubscribe history survives a re-signup.
//
// Requires BREVO_API_KEY + BREVO_LIST_ID and FIREBASE_SERVICE_ACCOUNT_B64
// (listUsers is a privileged Admin API call). No-ops with a log line when
// unconfigured so the stack deploys cleanly before the Brevo account exists.

const { initFirebase } = require('../lib/firebase-init');
const brevo = require('../lib/brevo');

const UPSERT_CONCURRENCY = 5; // Brevo free tier allows ~10 req/s

async function listAllFirebaseUsers(admin) {
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

exports.NewsletterSyncHandler = async () => {
  if (!brevo.isConfigured()) {
    console.info('newsletter-sync: BREVO_API_KEY / BREVO_LIST_ID not set, skipping');
    return { skipped: true, reason: 'brevo not configured' };
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    console.info('newsletter-sync: FIREBASE_SERVICE_ACCOUNT_B64 not set, skipping');
    return { skipped: true, reason: 'firebase credentials not configured' };
  }

  const admin = initFirebase();
  const listId = brevo.listId();

  const users = await listAllFirebaseUsers(admin);
  const eligible = users.filter((u) => u.email && !u.disabled);
  console.info(
    `newsletter-sync: ${users.length} Firebase users, ${eligible.length} with email`
  );

  // Upsert in small batches to stay under Brevo's rate limit.
  let upserted = 0;
  const failures = [];
  for (let i = 0; i < eligible.length; i += UPSERT_CONCURRENCY) {
    const batch = eligible.slice(i, i + UPSERT_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((u) =>
        brevo.upsertContact(u.email, {
          attributes: brevo.nameAttributes(u.displayName),
          listIds: [listId],
        })
      )
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        upserted += 1;
      } else {
        failures.push({ email: batch[idx].email, error: r.reason?.message });
      }
    });
  }
  if (failures.length) {
    console.error('newsletter-sync: upsert failures:', JSON.stringify(failures));
  }

  // Prune: list members with no matching Firebase account (deleted users).
  const firebaseEmails = new Set(eligible.map((u) => u.email.toLowerCase()));
  const listEmails = await brevo.getListEmails(listId);
  const stale = listEmails.filter((email) => !firebaseEmails.has(email));
  if (stale.length) {
    await brevo.removeFromList(listId, stale);
    console.info(`newsletter-sync: removed ${stale.length} stale contacts from list`);
  }

  const summary = {
    firebase_users: users.length,
    eligible: eligible.length,
    upserted,
    failed: failures.length,
    removed_from_list: stale.length,
  };
  console.info('newsletter-sync: done', JSON.stringify(summary));
  return summary;
};
