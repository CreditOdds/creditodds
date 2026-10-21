#!/usr/bin/env node
/**
 * Manage Firebase Admin Custom Claims
 *
 * Usage:
 *   node scripts/manage-admin.js add <uid>       - Grant admin access to a user
 *   node scripts/manage-admin.js remove <uid>   - Revoke admin access from a user
 *   node scripts/manage-admin.js check <uid>    - Check if a user is an admin
 *   node scripts/manage-admin.js list           - List all users (checks first 100)
 *
 * Note: Requires GOOGLE_APPLICATION_CREDENTIALS environment variable
 *       pointing to your Firebase service account key JSON file.
 *
 * To get the service account key:
 * 1. Go to Firebase Console > Project Settings > Service Accounts
 * 2. Click "Generate new private key"
 * 3. Save the JSON file securely
 * 4. Set: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 */

const { initFirebase } = require('../src/lib/firebase-init');
const auth = initFirebase();

async function setAdminClaim(uid, isAdmin) {
  try {
    // Get current user to verify they exist
    const user = await auth.getUser(uid);
    console.log(`Found user: ${user.email || user.uid}`);

    // Set custom claims
    await auth.setCustomUserClaims(uid, { admin: isAdmin });

    console.log(`Successfully ${isAdmin ? 'granted' : 'revoked'} admin access for ${user.email || uid}`);
    console.log('\nIMPORTANT: The user must sign out and sign back in for the change to take effect.');
    console.log('Alternatively, they can refresh their token by calling getIdToken(true).');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function checkAdmin(uid) {
  try {
    const user = await auth.getUser(uid);
    console.log(`User: ${user.email || user.uid}`);
    console.log(`UID: ${user.uid}`);
    console.log(`Admin: ${user.customClaims?.admin === true ? 'Yes' : 'No'}`);
    console.log(`Custom Claims:`, user.customClaims || 'None');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function listUsers() {
  try {
    const listResult = await auth.listUsers(100);
    console.log('Users (first 100):');
    console.log('─'.repeat(80));

    for (const user of listResult.users) {
      const isAdmin = user.customClaims?.admin === true;
      const adminBadge = isAdmin ? ' [ADMIN]' : '';
      console.log(`${user.uid} | ${user.email || 'No email'}${adminBadge}`);
    }

    console.log('─'.repeat(80));
    console.log(`Total: ${listResult.users.length} users`);
    console.log(`Admins: ${listResult.users.filter(u => u.customClaims?.admin === true).length}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const [,, command, uid] = process.argv;

if (!command) {
  console.log(`
Firebase Admin Management Script

Usage:
  node scripts/manage-admin.js add <uid>       Grant admin access
  node scripts/manage-admin.js remove <uid>   Revoke admin access
  node scripts/manage-admin.js check <uid>    Check admin status
  node scripts/manage-admin.js list           List all users

Environment:
  GOOGLE_APPLICATION_CREDENTIALS  Path to Firebase service account key JSON
  FIREBASE_PROJECT_ID             Firebase project ID (default: creditodds)
  `);
  process.exit(0);
}

(async () => {
  switch (command) {
    case 'add':
      if (!uid) {
        console.error('Error: UID required. Usage: node manage-admin.js add <uid>');
        process.exit(1);
      }
      await setAdminClaim(uid, true);
      break;

    case 'remove':
      if (!uid) {
        console.error('Error: UID required. Usage: node manage-admin.js remove <uid>');
        process.exit(1);
      }
      await setAdminClaim(uid, false);
      break;

    case 'check':
      if (!uid) {
        console.error('Error: UID required. Usage: node manage-admin.js check <uid>');
        process.exit(1);
      }
      await checkAdmin(uid);
      break;

    case 'list':
      await listUsers();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }

  process.exit(0);
})();
