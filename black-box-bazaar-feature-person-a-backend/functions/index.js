const { onCall } = require('firebase-functions/v2/https');

const { loginTeamHandler } = require('./src/auth/loginTeam');
const { submitAnswerHandler } = require('./src/submissions/submitAnswer');

exports.loginTeam = onCall({ region: 'asia-south1' }, loginTeamHandler);
exports.submitAnswer = onCall({ region: 'asia-south1' }, submitAnswerHandler);
