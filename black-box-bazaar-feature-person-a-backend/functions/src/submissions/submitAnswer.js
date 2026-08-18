const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const { admin, db } = require('../config');

const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);

function badRequestError(message) {
  return new HttpsError('invalid-argument', message);
}

function validateSubmitAnswerInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw badRequestError('cardId, answer, and confidence are required.');
  }

  const { cardId, answer, confidence } = data;

  if (typeof cardId !== 'string' || !cardId) {
    throw badRequestError('cardId is required.');
  }

  if (typeof answer !== 'string' || !answer.trim()) {
    throw badRequestError('answer is required.');
  }

  if (typeof confidence !== 'string' || !CONFIDENCE_LEVELS.has(confidence)) {
    throw badRequestError('confidence must be one of "low", "medium", or "high".');
  }

  return { cardId, answer: answer.trim(), confidence };
}

/**
 * Ownership-instance ID for the CURRENT owner of a card, per
 * docs/DATABASE.md #17 (submission uniqueness is keyed by
 * cardId + ownershipInstanceId, not cardId alone, so a card that changes
 * hands gives its new owner a fresh submission opportunity).
 *
 * NOTE FOR THE TRADING DEVELOPER: this is computed as
 * `${cardId}-${currentOwner}-001` rather than tracked with an incrementing
 * per-card counter, because no ownership-history/counter field exists yet
 * (trading is not implemented in this codebase). This is correct for a
 * card's first ownership period for a given team. If a team can
 * re-acquire a card it previously owned (sells it, later buys it back),
 * this recomputes the SAME instance ID as their first period, and this
 * function will treat a second submission attempt as an already-submitted
 * duplicate rather than granting a fresh "002" opportunity - it fails
 * safe (blocks a resubmission) rather than failing open. If re-acquisition
 * should grant a new submission opportunity, the trade-completion
 * transaction will need to maintain an explicit per-card ownership
 * counter, and this function will need to read that counter instead of
 * hardcoding "001".
 */
function ownershipInstanceId(cardId, teamId) {
  return `${cardId}-${teamId}-001`;
}

/**
 * Validates ownership, rejects duplicate submissions, checks the
 * submitted answer against the protected answerKeys/{cardId} record, and
 * atomically records the submission and updates the team's score.
 *
 * The correct answer, hidden rule, and explanation are read from
 * answerKeys/{cardId} only inside this trusted backend transaction and
 * are never included in the response or in any client-readable write.
 *
 * Game-phase gating (docs/DATABASE.md #16, #22) is intentionally not
 * enforced here yet - phase permissions for submissions are not
 * unambiguously specified for every phase, and implementing that is
 * deferred to a future change once the phase-management contract is
 * settled.
 */
async function submitAnswerHandler(request) {
  if (!request.auth || !request.auth.token || !request.auth.token.teamId) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const teamId = request.auth.token.teamId;
  const { cardId, answer, confidence } = validateSubmitAnswerInput(request.data);

  try {
    const result = await db.runTransaction(async (tx) => {
      const cardRef = db.collection('cards').doc(cardId);
      const answerKeyRef = db.collection('answerKeys').doc(cardId);

      const [cardSnap, answerKeySnap] = await Promise.all([tx.get(cardRef), tx.get(answerKeyRef)]);

      if (!cardSnap.exists) {
        throw new HttpsError('not-found', 'Card not found.');
      }

      const card = cardSnap.data();

      if (card.currentOwner !== teamId) {
        throw new HttpsError('permission-denied', 'Team does not currently own this card.');
      }

      if (!answerKeySnap.exists) {
        logger.error('SUBMISSION_ERROR', {
          event: 'SUBMISSION_ERROR',
          teamId,
          cardId,
          reason: 'missing_answer_key',
        });
        throw new HttpsError('internal', 'Unable to validate this submission.');
      }

      const instanceId = ownershipInstanceId(cardId, teamId);
      const submissionRef = db.collection('submissions').doc(instanceId);
      const submissionSnap = await tx.get(submissionRef);

      if (submissionSnap.exists) {
        throw new HttpsError('already-exists', 'An answer has already been submitted for this card.');
      }

      const correctAnswer = answerKeySnap.data().answer;
      const isCorrect = answer === correctAnswer;
      const pointsAwarded = isCorrect ? card.pointsCorrect : card.pointsWrong;
      const status = isCorrect ? 'correct' : 'incorrect';

      tx.set(submissionRef, {
        cardId,
        teamId,
        ownershipInstanceId: instanceId,
        answer,
        confidence,
        status,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const teamRef = db.collection('teams').doc(teamId);
      tx.update(teamRef, { score: admin.firestore.FieldValue.increment(pointsAwarded) });

      return { status, pointsAwarded };
    });

    logger.info('SUBMISSION_RECORDED', {
      event: 'SUBMISSION_RECORDED',
      teamId,
      cardId,
      status: result.status,
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('SUBMISSION_ERROR', { event: 'SUBMISSION_ERROR', teamId, cardId, stage: 'transaction' });
    throw new HttpsError('internal', 'Unable to record this submission.');
  }
}

module.exports = { submitAnswerHandler, validateSubmitAnswerInput, ownershipInstanceId };
