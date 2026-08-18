const {
  buildSeedDocuments,
  STARTING_BITBUCKS,
  STARTING_SCORE,
  GAME_DOC_ID,
  INITIAL_PHASE,
  INITIAL_IS_ACTIVE,
} = require('../src/seedData/buildSeedDocuments');

function fixture() {
  const event = {
    teams: [
      { teamId: 'TEAM-01', teamNumber: 1, cardIds: ['A1', 'A2'] },
      { teamId: 'TEAM-07', teamNumber: 7, cardIds: ['G1'] },
    ],
    cards: [
      {
        cardId: 'A1',
        title: 'Next in Line',
        tier: '1',
        initialOwner: 'TEAM-01',
        currentOwner: 'TEAM-04', // deliberately stale/wrong, to prove seeding resets it
        status: 'owned',
        pointsCorrect: 5,
        pointsWrong: -1,
        examples: [{ input: '10', output: '11' }],
        finalInput: '54',
        question: 'Study the pattern shown by the examples, then determine the output for the final input.',
      },
      {
        cardId: 'N4',
        title: 'Sum of XOR',
        tier: '3',
        initialOwner: 'TEAM-14',
        currentOwner: 'TEAM-14',
        status: 'owned',
        pointsCorrect: 15,
        pointsWrong: -5,
        examples: [{ input: '123', output: '0' }],
        finalInput: '456',
        question: 'Study the pattern shown by the examples, then determine the output for the final input.',
      },
    ],
  };

  const answers = {
    A1: { answer: '59', hiddenRule: 'Smallest prime greater than the input.', explanation: '...' },
    N4: { answer: '17', hiddenRule: null, explanation: null, unconfirmedRule: true },
  };

  return { event, answers };
}

describe('buildSeedDocuments', () => {
  test('maps teams to id/data pairs with placeholder names and documented starting values', () => {
    const { event, answers } = fixture();

    const { teams } = buildSeedDocuments(event, answers);

    expect(teams).toEqual([
      { id: 'TEAM-01', data: { teamNumber: 1, teamName: 'Team 01', score: STARTING_SCORE, bitBucks: STARTING_BITBUCKS } },
      { id: 'TEAM-07', data: { teamNumber: 7, teamName: 'Team 07', score: STARTING_SCORE, bitBucks: STARTING_BITBUCKS } },
    ]);
  });

  test('does not leak cardIds onto the team document', () => {
    const { event, answers } = fixture();

    const { teams } = buildSeedDocuments(event, answers);

    teams.forEach((team) => expect(team.data.cardIds).toBeUndefined());
  });

  test('forces currentOwner to equal initialOwner regardless of the seed JSON value', () => {
    const { event, answers } = fixture();

    const { cards } = buildSeedDocuments(event, answers);

    const a1 = cards.find((c) => c.id === 'A1');
    expect(a1.data.currentOwner).toBe('TEAM-01');
    expect(a1.data.initialOwner).toBe('TEAM-01');
  });

  test('preserves player-visible card fields', () => {
    const { event, answers } = fixture();

    const { cards } = buildSeedDocuments(event, answers);

    const a1 = cards.find((c) => c.id === 'A1');
    expect(a1.data).toMatchObject({
      cardId: 'A1',
      title: 'Next in Line',
      tier: '1',
      status: 'owned',
      pointsCorrect: 5,
      pointsWrong: -1,
      examples: [{ input: '10', output: '11' }],
      finalInput: '54',
    });
  });

  test('builds an answerKeys entry per card from the answers map, preserving unconfirmedRule only when present', () => {
    const { event, answers } = fixture();

    const { answerKeys } = buildSeedDocuments(event, answers);

    expect(answerKeys).toEqual([
      { id: 'A1', data: { answer: '59', hiddenRule: 'Smallest prime greater than the input.', explanation: '...' } },
      { id: 'N4', data: { answer: '17', hiddenRule: null, explanation: null, unconfirmedRule: true } },
    ]);
    expect(answerKeys.find((a) => a.id === 'A1').data.unconfirmedRule).toBeUndefined();
  });

  test('builds a single initial game document from the documented constants', () => {
    const { event, answers } = fixture();

    const { game } = buildSeedDocuments(event, answers);

    expect(game).toEqual({ id: GAME_DOC_ID, data: { phase: INITIAL_PHASE, isActive: INITIAL_IS_ACTIVE } });
  });
});
