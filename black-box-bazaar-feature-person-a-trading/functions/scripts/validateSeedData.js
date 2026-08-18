#!/usr/bin/env node
/**
 * DEV/ADMIN-ONLY TOOL. Not deployed as a Cloud Function, never
 * reachable from the player frontend.
 *
 * Validates the gitignored local seed inputs (seed-data/event.local.json and
 * seed-data/answers.local.json) against the structural rules required before
 * they can be used to seed Firestore: team/card counts, ownership, tiers,
 * and answer-key coverage.
 *
 * Usage:
 *   node scripts/validateSeedData.js
 */

const fs = require('fs');
const path = require('path');
const { validateSeedData } = require('../src/seedData/validateSeedData');

const eventPath = path.join(__dirname, '..', 'seed-data', 'event.local.json');
const answersPath = path.join(__dirname, '..', 'seed-data', 'answers.local.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required seed file: ${filePath}`);
    process.exitCode = 1;
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const event = readJson(eventPath);
  const answers = readJson(answersPath);
  if (!event || !answers) return;

  const { valid, errors } = validateSeedData(event, answers);

  if (valid) {
    console.log(`Seed data valid: ${event.teams.length} teams, ${event.cards.length} cards.`);
    if (event.meta?.flaggedForReview?.length) {
      console.log(`${event.meta.flaggedForReview.length} card(s) flagged for organizer review:`);
      for (const flag of event.meta.flaggedForReview) {
        console.log(`  - ${flag.cardId}: ${flag.reason}`);
      }
    }
  } else {
    console.error('Seed data INVALID:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  }
}

main();
