const STARTING_BITBUCKS = 100; // docs/DATABASE.md #3: "Every team starts with 100 BitBucks."
const STARTING_SCORE = 0; // docs/DATABASE.md #3: "Every team starts with score 0."
const GAME_DOC_ID = 'main';
const INITIAL_PHASE = 'CHECK_IN';
const INITIAL_IS_ACTIVE = true;

function teamNamePlaceholder(teamNumber) {
  return `Team ${String(teamNumber).padStart(2, '0')}`;
}

/**
 * Pure transform from the local event/answers seed JSON shape into plain
 * Firestore {id, data} document pairs. Performs no I/O and attaches no
 * timestamps, so it stays trivially unit-testable; the caller
 * (seedEventData.js) attaches createdAt/updatedAt at write time.
 *
 * Assumes `event`/`answers` have already passed validateSeedData.
 */
function buildSeedDocuments(event, answers) {
  const teams = event.teams.map((team) => ({
    id: team.teamId,
    data: {
      teamNumber: team.teamNumber,
      teamName: teamNamePlaceholder(team.teamNumber),
      score: STARTING_SCORE,
      bitBucks: STARTING_BITBUCKS,
    },
  }));

  const cards = event.cards.map((card) => ({
    id: card.cardId,
    // currentOwner is always forced to initialOwner at seed time (docs/DATABASE.md #7),
    // regardless of whatever currentOwner value happens to be sitting in the seed JSON.
    data: { ...card, currentOwner: card.initialOwner },
  }));

  const answerKeys = event.cards.map((card) => ({
    id: card.cardId,
    data: { ...answers[card.cardId] },
  }));

  const game = {
    id: GAME_DOC_ID,
    data: {
      phase: INITIAL_PHASE,
      isActive: INITIAL_IS_ACTIVE,
    },
  };

  return { teams, cards, answerKeys, game };
}

module.exports = {
  buildSeedDocuments,
  STARTING_BITBUCKS,
  STARTING_SCORE,
  GAME_DOC_ID,
  INITIAL_PHASE,
  INITIAL_IS_ACTIVE,
};
