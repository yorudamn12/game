#!/usr/bin/env node
/**
 * DEV/ADMIN-ONLY TOOL. Not deployed as a Cloud Function, never
 * reachable from the player frontend.
 *
 * Seeds Firestore with the finalized event data: 14 team documents, 56
 * card documents, 56 protected answerKeys documents, and the initial
 * game/main document. Reads from the gitignored local seed inputs
 * (seed-data/event.local.json, seed-data/answers.local.json), validates
 * them with the same validator as `npm run validate:seed`, and refuses to
 * run if the event has already been seeded.
 *
 * Local emulator usage:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   GCLOUD_PROJECT=black-box-bazaar \
 *   node scripts/seedEventData.js
 *
 * Production usage requires trusted Application Default Credentials
 * (e.g. GOOGLE_APPLICATION_CREDENTIALS pointing at a service account
 * that is NOT committed to git).
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { seedEventData, AlreadySeededError, InvalidSeedDataError } = require('../src/seedData/seedEventData');

const eventPath = path.join(__dirname, '..', 'seed-data', 'event.local.json');
const answersPath = path.join(__dirname, '..', 'seed-data', 'answers.local.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required seed file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const event = readJson(eventPath);
  const answers = readJson(answersPath);

  admin.initializeApp();
  const db = admin.firestore();

  const result = await seedEventData({ db, admin, event, answers });

  console.log(
    `Seeded ${result.teams} teams, ${result.cards} cards, ${result.answerKeys} answer keys, and game/${result.game}.`,
  );
}

main().catch((error) => {
  if (error instanceof AlreadySeededError || error instanceof InvalidSeedDataError) {
    console.error(error.message);
  } else {
    console.error('Seeding failed:', error.message);
  }
  process.exitCode = 1;
});
