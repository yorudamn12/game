const { validateSeedData } = require('./validateSeedData');
const { buildSeedDocuments, GAME_DOC_ID } = require('./buildSeedDocuments');

class InvalidSeedDataError extends Error {
  constructor(errors) {
    super(`Seed data failed validation:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'InvalidSeedDataError';
    this.errors = errors;
  }
}

class AlreadySeededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AlreadySeededError';
  }
}

/**
 * Writes the finalized event/card/answer seed data to Firestore: 14 team
 * documents, 56 card documents, 56 protected answerKeys documents, and the
 * initial game/{GAME_DOC_ID} document.
 *
 * DEV/ADMIN-ONLY. This function is never wired to a callable Cloud Function
 * and is only ever invoked from the trusted scripts/seedEventData.js CLI
 * tool, so normal players have no path to trigger it.
 *
 * Refuses to run if the event has already been seeded (game/{GAME_DOC_ID}
 * already exists), so re-running never overwrites live score/BitBuck/
 * ownership state with the original seed values. Callers that genuinely
 * need to reseed (e.g. against a local emulator during development) must
 * delete the existing game document themselves first.
 *
 * All writes happen in a single Firestore batch so a failure partway
 * through never leaves teams/cards/answerKeys/game partially seeded.
 */
async function seedEventData({ db, admin, event, answers }) {
  const { valid, errors } = validateSeedData(event, answers);
  if (!valid) {
    throw new InvalidSeedDataError(errors);
  }

  const gameRef = db.collection('game').doc(GAME_DOC_ID);
  const existingGame = await gameRef.get();
  if (existingGame.exists) {
    throw new AlreadySeededError(
      `Event is already seeded: game/${GAME_DOC_ID} already exists. Refusing to overwrite existing game data.`,
    );
  }

  const { teams, cards, answerKeys, game } = buildSeedDocuments(event, answers);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const batch = db.batch();

  for (const team of teams) {
    batch.set(db.collection('teams').doc(team.id), { ...team.data, createdAt: timestamp });
  }
  for (const card of cards) {
    batch.set(db.collection('cards').doc(card.id), { ...card.data, createdAt: timestamp });
  }
  for (const answerKey of answerKeys) {
    // answerKeys carry no createdAt in docs/DATABASE.md #6 - they are
    // protected content, not player-facing records with their own lifecycle.
    batch.set(db.collection('answerKeys').doc(answerKey.id), answerKey.data);
  }
  batch.set(gameRef, { ...game.data, updatedAt: timestamp });

  await batch.commit();

  return {
    teams: teams.length,
    cards: cards.length,
    answerKeys: answerKeys.length,
    game: game.id,
  };
}

module.exports = { seedEventData, AlreadySeededError, InvalidSeedDataError };
