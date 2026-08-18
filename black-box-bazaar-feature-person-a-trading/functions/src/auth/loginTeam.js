const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const { db, auth } = require('../config');
const { findTeamByNumber } = require('../teams/getTeam');
const { getOwnedCards } = require('../teams/getOwnedCards');
const { verifyPin } = require('../credentials/verifyPin');
const { getOrCreateTeamAuthUser, setTeamIdClaim } = require('./claims');

const PIN_PATTERN = /^\d{4,8}$/;

function badRequestError() {
  return new HttpsError('invalid-argument', 'Team number and PIN are required.');
}

// A single generic failure is used for every credential-related
// rejection so the client can never learn whether a team exists, a
// credential record exists, the team is inactive, or the PIN was wrong.
function authFailureError() {
  return new HttpsError('unauthenticated', 'Invalid team credentials.');
}

function internalError() {
  return new HttpsError('internal', 'Unable to complete authentication.');
}

function validateLoginInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw badRequestError();
  }

  const { teamNumber, teamPin } = data;

  if (teamNumber === undefined || teamNumber === null) {
    throw badRequestError();
  }

  if (teamPin === undefined || teamPin === null) {
    throw badRequestError();
  }

  if (typeof teamPin !== 'string') {
    throw badRequestError();
  }

  if (typeof teamNumber !== 'number' && typeof teamNumber !== 'string') {
    throw badRequestError();
  }

  const numericTeamNumber = typeof teamNumber === 'string' ? Number(teamNumber) : teamNumber;

  if (!Number.isInteger(numericTeamNumber) || numericTeamNumber <= 0) {
    // Malformed team-number format - folded into the generic auth
    // failure rather than a distinct error (see docs/CREDENTIALS.md #9).
    throw authFailureError();
  }

  if (!PIN_PATTERN.test(teamPin)) {
    throw authFailureError();
  }

  return { teamNumber: numericTeamNumber, teamPin };
}

async function loginTeamHandler(request) {
  const { teamNumber, teamPin } = validateLoginInput(request.data);

  const team = await findTeamByNumber(db, teamNumber);
  if (!team) {
    logger.info('LOGIN_FAILURE', { event: 'LOGIN_FAILURE', reason: 'team_not_found' });
    throw authFailureError();
  }

  const { teamId } = team;

  const credentialSnapshot = await db.collection('teamCredentials').doc(teamId).get();
  if (!credentialSnapshot.exists) {
    logger.info('LOGIN_FAILURE', { event: 'LOGIN_FAILURE', teamId, reason: 'no_credentials' });
    throw authFailureError();
  }

  const credential = credentialSnapshot.data();

  if (credential.active !== true) {
    logger.info('LOGIN_FAILURE', { event: 'LOGIN_FAILURE', teamId, reason: 'inactive' });
    throw authFailureError();
  }

  const pinValid = await verifyPin(teamPin, credential.pinHash);
  if (!pinValid) {
    logger.info('LOGIN_FAILURE', { event: 'LOGIN_FAILURE', teamId, reason: 'invalid_pin' });
    throw authFailureError();
  }

  let user;
  try {
    user = await getOrCreateTeamAuthUser(teamId);
    await setTeamIdClaim(user.uid, teamId);
  } catch (error) {
    logger.error('LOGIN_ERROR', { event: 'LOGIN_ERROR', teamId, stage: 'auth_user' });
    throw internalError();
  }

  let customToken;
  try {
    customToken = await auth.createCustomToken(user.uid, { teamId });
  } catch (error) {
    logger.error('LOGIN_ERROR', { event: 'LOGIN_ERROR', teamId, stage: 'custom_token' });
    throw internalError();
  }

  let ownedCards;
  try {
    ownedCards = await getOwnedCards(db, teamId);
  } catch (error) {
    logger.error('LOGIN_ERROR', { event: 'LOGIN_ERROR', teamId, stage: 'owned_cards' });
    throw internalError();
  }

  logger.info('LOGIN_SUCCESS', { event: 'LOGIN_SUCCESS', teamId });

  return {
    customToken,
    uid: user.uid,
    teamId,
    teamNumber: team.teamNumber,
    teamName: team.teamName,
    ownedCards,
  };
}

module.exports = { loginTeamHandler, validateLoginInput };
