/**
 * Slack notifications for the reply agent. Posts to SLACK_WEBHOOK_URL if set,
 * otherwise a no-op. Failures never throw — a Slack hiccup must not break the
 * agent or fail the workflow.
 */

async function send({ text, blocks } = {}) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const body = blocks ? { blocks, text: text || ' ' } : { text };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`slack: webhook returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`slack: send failed (${err.message})`);
    return false;
  }
}

/**
 * Notify about a single selected reply (live or shadow). This is the trial's
 * real-time safety feed: every reply the agent commits to shows up immediately.
 */
async function notifyReply({ mode, author, register, score, text, tweetId, replyId }) {
  const tag = mode === 'live' ? ':rotating_light: LIVE POSTED' : ':eyes: SHADOW (would post)';
  const original = `https://x.com/${author}/status/${tweetId}`;
  const lines = [
    `*${tag}*  _${register}_ · q${score}`,
    `> ${text}`,
    `↳ replying to <${original}|@${author}>`,
  ];
  if (mode === 'live' && replyId) {
    lines.push(`✅ <https://x.com/creditodds/status/${replyId}|view the posted reply>`);
  }
  return send({ text: lines.join('\n') });
}

module.exports = { send, notifyReply };
