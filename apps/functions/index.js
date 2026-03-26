const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    functions.logger.warn("SLACK_WEBHOOK_URL not set — skipping notification");
    return;
  }

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New signup*\n• Email: ${user.email || "N/A"}\n• UID: \`${user.uid}\`\n• Provider: ${user.providerData?.[0]?.providerId || "unknown"}`,
        },
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    functions.logger.error("Slack webhook failed", {
      status: response.status,
      body: await response.text(),
    });
  }
});
