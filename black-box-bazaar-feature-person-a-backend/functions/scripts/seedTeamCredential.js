#!/usr/bin/env node
/**
 * DEV/ADMIN-ONLY TOOL. Not deployed as a Cloud Function, never
 * reachable from the player frontend.
 *
 * Creates or updates a team's protected credential record with a
 * securely hashed PIN. The plaintext PIN passed on the command line
 * is never written to Firestore or logged.
 *
 * Local emulator usage:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   GCLOUD_PROJECT=black-box-bazaar \
 *   node scripts/seedTeamCredential.js TEAM-01 1 1234
 *
 * Production usage requires trusted Application Default Credentials
 * (e.g. GOOGLE_APPLICATION_CREDENTIALS pointing at a service account
 * that is NOT committed to git).
 */

const admin = require('firebase-admin');
const { hashPin } = require('../src/credentials/verifyPin');

async function main() {
  const [teamId, teamNumberArg, pin] = process.argv.slice(2);

  if (!teamId || !teamNumberArg || !pin) {
    console.error('Usage: node scripts/seedTeamCredential.js <teamId> <teamNumber> <pin>');
    process.exitCode = 1;
    return;
  }

  const teamNumber = Number(teamNumberArg);
  if (!Number.isInteger(teamNumber) || teamNumber <= 0) {
    console.error('teamNumber must be a positive integer.');
    process.exitCode = 1;
    return;
  }

  if (!/^\d{4,8}$/.test(pin)) {
    console.error('pin must be 4-8 digits.');
    process.exitCode = 1;
    return;
  }

  admin.initializeApp();
  const db = admin.firestore();

  const pinHash = await hashPin(pin);

  await db.collection('teamCredentials').doc(teamId).set({
    teamId,
    pinHash,
    active: true,
  });

  await db.collection('teams').doc(teamId).set(
    { teamNumber },
    { merge: true },
  );

  console.log(`Credential seeded for ${teamId} (team number ${teamNumber}).`);
}

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
});
