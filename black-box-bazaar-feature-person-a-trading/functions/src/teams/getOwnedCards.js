/**
 * Returns the player-visible cards a team currently owns.
 *
 * Cards never store answer/hidden-rule/explanation data (that lives in the
 * separate protected answerKeys/{cardId} collection - see docs/DATABASE.md
 * #5-#6), so every field on a cards/{cardId} document is already safe to
 * return directly to the owning team.
 */
async function getOwnedCards(db, teamId) {
  const snapshot = await db.collection('cards').where('currentOwner', '==', teamId).get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = { getOwnedCards };
