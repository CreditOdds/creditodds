#!/usr/bin/env node
/**
 * Diagnostic: which X account do the TWITTER_* credentials actually authenticate
 * as? If this prints anything other than @creditodds, the reply bot is posting as
 * the wrong account (which explains the "conversation not allowed" 403 when the
 * real @creditodds can reply manually).
 */

const { TwitterApi } = require('twitter-api-v2');

async function main() {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });

  const me = await client.v2.me({ 'user.fields': 'username,name,verified,verified_type,created_at' });
  console.log('=== Authenticated identity for the TWITTER_* creds ===');
  console.log(JSON.stringify(me.data, null, 2));
  console.log(`\n>> Posting as: @${me.data.username} (${me.data.name})`);
  console.log(`>> verified: ${me.data.verified} / type: ${me.data.verified_type || 'none'}`);
  if (me.data.username && me.data.username.toLowerCase() !== 'creditodds') {
    console.log(`\n!!! MISMATCH: creds are NOT @creditodds. This is the bug.`);
  } else {
    console.log(`\nOK: creds are @creditodds.`);
  }
}

main().catch((err) => {
  console.error('whoami failed:', err.message);
  process.exit(1);
});
