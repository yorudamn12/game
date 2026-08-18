/**
 * Resolves a submitted team number to its teamId and public team data.
 * Returns null when no team matches - callers must treat this as a
 * generic authentication failure rather than a distinct error.
 */
async function findTeamByNumber(db, teamNumber) {
  const snapshot = await db
    .collection('teams')
    .where('teamNumber', '==', teamNumber)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { teamId: doc.id, ...doc.data() };
}

module.exports = { findTeamByNumber };
