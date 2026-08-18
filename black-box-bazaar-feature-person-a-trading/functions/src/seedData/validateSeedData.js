const EXPECTED_TEAMS = 14;
const CARDS_PER_TEAM = 4;
const EXPECTED_CARDS = EXPECTED_TEAMS * CARDS_PER_TEAM;
const VALID_TIERS = new Set(['1', '2', '3']);

/**
 * Validates the shape and cross-referential integrity of the local event/answers
 * seed input pair before it is ever used to write Firestore documents.
 * Pure/synchronous so it can run against fixtures in tests as well as the real
 * gitignored event.local.json / answers.local.json files via the CLI script.
 */
function validateSeedData(event, answers) {
  const errors = [];

  const teams = Array.isArray(event?.teams) ? event.teams : [];
  const cards = Array.isArray(event?.cards) ? event.cards : [];
  answers = answers && typeof answers === 'object' ? answers : {};

  if (teams.length !== EXPECTED_TEAMS) {
    errors.push(`Expected exactly ${EXPECTED_TEAMS} teams, found ${teams.length}.`);
  }

  if (cards.length !== EXPECTED_CARDS) {
    errors.push(`Expected exactly ${EXPECTED_CARDS} cards, found ${cards.length}.`);
  }

  const cardIdCounts = new Map();
  for (const card of cards) {
    cardIdCounts.set(card.cardId, (cardIdCounts.get(card.cardId) || 0) + 1);
  }
  for (const [cardId, count] of cardIdCounts) {
    if (count > 1) errors.push(`Duplicate card ID: ${cardId} appears ${count} times.`);
  }

  for (const card of cards) {
    if (!card.initialOwner) {
      errors.push(`Card ${card.cardId} has no initialOwner.`);
    }
    if (!VALID_TIERS.has(String(card.tier))) {
      errors.push(`Card ${card.cardId} has invalid tier: ${card.tier} (expected 1, 2, or 3).`);
    }
    if (!Object.prototype.hasOwnProperty.call(answers, card.cardId)) {
      errors.push(`Card ${card.cardId} has no corresponding entry in answers.`);
    } else if (!answers[card.cardId]?.answer) {
      errors.push(`Card ${card.cardId} has an answers entry but no answer value.`);
    }
  }

  const cardsByTeam = new Map();
  for (const card of cards) {
    if (!card.initialOwner) continue;
    cardsByTeam.set(card.initialOwner, (cardsByTeam.get(card.initialOwner) || 0) + 1);
  }
  for (const team of teams) {
    const count = cardsByTeam.get(team.teamId) || 0;
    if (count !== CARDS_PER_TEAM) {
      errors.push(`Team ${team.teamId} has ${count} initial cards, expected ${CARDS_PER_TEAM}.`);
    }
  }

  const teamIds = new Set(teams.map((t) => t.teamId));
  for (const [ownerId] of cardsByTeam) {
    if (!teamIds.has(ownerId)) {
      errors.push(`Card(s) reference unknown initialOwner team: ${ownerId}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateSeedData, EXPECTED_TEAMS, CARDS_PER_TEAM, EXPECTED_CARDS };
