const { auth } = require('../config');

/**
 * Returns the Firebase Auth user backing a team, creating it on first
 * login. The UID is deterministically derived from teamId so the same
 * team always maps to the same Firebase Auth identity.
 */
async function getOrCreateTeamAuthUser(teamId) {
  try {
    return await auth.getUser(teamId);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return auth.createUser({ uid: teamId, disabled: false });
    }
    throw error;
  }
}

/**
 * Sets the trusted teamId authorization claim used by Firestore
 * Security Rules (request.auth.token.teamId). Only trusted backend
 * code may call this.
 */
async function setTeamIdClaim(uid, teamId) {
  await auth.setCustomUserClaims(uid, { teamId });
}

module.exports = { getOrCreateTeamAuthUser, setTeamIdClaim };
