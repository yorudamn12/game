const mockRunTransaction = jest.fn();
const mockTxSet = jest.fn();
const mockTxUpdate = jest.fn();
const mockServerTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');
const mockIncrement = jest.fn((n) => ({ __increment: n }));

jest.mock('../src/config', () => {
  const collection = jest.fn((name) => ({
    doc: jest.fn((id) => ({ __path: `${name}/${id}` })),
  }));

  return {
    db: {
      collection,
      runTransaction: (...args) => mockRunTransaction(...args),
    },
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: (...args) => mockServerTimestamp(...args),
          increment: (...args) => mockIncrement(...args),
        },
      },
    },
  };
});

const { submitAnswerHandler } = require('../src/submissions/submitAnswer');

function setupTransaction(docsByPath = {}) {
  const txGet = jest.fn((ref) => {
    const doc = docsByPath[ref.__path];
    return Promise.resolve(doc ? { exists: true, data: () => doc } : { exists: false });
  });
  mockRunTransaction.mockImplementation(async (fn) => fn({ get: txGet, set: mockTxSet, update: mockTxUpdate }));
  return txGet;
}

function ownedCard(overrides = {}) {
  return {
    cardId: 'A1',
    tier: '1',
    currentOwner: 'TEAM-01',
    initialOwner: 'TEAM-01',
    status: 'owned',
    pointsCorrect: 5,
    pointsWrong: -1,
    ...overrides,
  };
}

function authenticatedRequest(data, teamId = 'TEAM-01') {
  return { auth: { token: { teamId } }, data };
}

describe('submitAnswerHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects an unauthenticated request without touching Firestore', async () => {
    await expect(
      submitAnswerHandler({ auth: null, data: { cardId: 'A1', answer: '59', confidence: 'high' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });

    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test('rejects a request from an authenticated user with no teamId claim', async () => {
    await expect(
      submitAnswerHandler({ auth: { token: {} }, data: { cardId: 'A1', answer: '59', confidence: 'high' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });

    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test('rejects a missing cardId', async () => {
    await expect(
      submitAnswerHandler(authenticatedRequest({ answer: '59', confidence: 'high' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test('rejects a missing answer', async () => {
    await expect(
      submitAnswerHandler(authenticatedRequest({ cardId: 'A1', confidence: 'high' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test('rejects an invalid confidence value', async () => {
    await expect(
      submitAnswerHandler(authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'extreme' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test('rejects submission for a card that does not exist', async () => {
    setupTransaction({});

    await expect(
      submitAnswerHandler(authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'high' })),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(mockTxSet).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  test('rejects submission when the team does not currently own the card', async () => {
    setupTransaction({
      'cards/A1': ownedCard({ currentOwner: 'TEAM-02' }),
      'answerKeys/A1': { answer: '59' },
    });

    await expect(
      submitAnswerHandler(authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'high' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockTxSet).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  test('rejects a duplicate submission for the same ownership instance', async () => {
    setupTransaction({
      'cards/A1': ownedCard(),
      'answerKeys/A1': { answer: '59' },
      'submissions/A1-TEAM-01-001': { cardId: 'A1', teamId: 'TEAM-01', status: 'correct' },
    });

    await expect(
      submitAnswerHandler(authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'high' })),
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(mockTxSet).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  test('rejects when the answer key is missing (data integrity issue), without leaking why', async () => {
    setupTransaction({
      'cards/A1': ownedCard(),
    });

    await expect(
      submitAnswerHandler(authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'high' })),
    ).rejects.toMatchObject({ code: 'internal' });
    expect(mockTxSet).not.toHaveBeenCalled();
  });

  test('records a correct tier-1 submission and awards +5 to the team score', async () => {
    setupTransaction({
      'cards/A1': ownedCard({ tier: '1', pointsCorrect: 5, pointsWrong: -1 }),
      'answerKeys/A1': { answer: '59', hiddenRule: 'secret rule', explanation: 'secret explanation' },
    });

    const result = await submitAnswerHandler(
      authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'high' }),
    );

    expect(result).toEqual({ status: 'correct', pointsAwarded: 5 });

    expect(mockTxSet).toHaveBeenCalledWith(
      { __path: 'submissions/A1-TEAM-01-001' },
      {
        cardId: 'A1',
        teamId: 'TEAM-01',
        ownershipInstanceId: 'A1-TEAM-01-001',
        answer: '59',
        confidence: 'high',
        status: 'correct',
        submittedAt: 'SERVER_TIMESTAMP',
      },
    );
    expect(mockTxUpdate).toHaveBeenCalledWith({ __path: 'teams/TEAM-01' }, { score: { __increment: 5 } });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/secret rule/);
    expect(serialized).not.toMatch(/secret explanation/);
  });

  test('records an incorrect tier-3 submission and deducts 5 from the team score, without revealing the correct answer', async () => {
    setupTransaction({
      'cards/N4': ownedCard({ cardId: 'N4', tier: '3', currentOwner: 'TEAM-14', pointsCorrect: 15, pointsWrong: -5 }),
      'answerKeys/N4': { answer: '17', hiddenRule: null, explanation: null, unconfirmedRule: true },
    });

    const result = await submitAnswerHandler(
      authenticatedRequest({ cardId: 'N4', answer: '99', confidence: 'low' }, 'TEAM-14'),
    );

    expect(result).toEqual({ status: 'incorrect', pointsAwarded: -5 });
    expect(mockTxUpdate).toHaveBeenCalledWith({ __path: 'teams/TEAM-14' }, { score: { __increment: -5 } });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('17');
    expect(serialized).not.toMatch(/unconfirmedRule/i);
  });

  test('trims whitespace from the submitted answer before comparing and storing it', async () => {
    setupTransaction({
      'cards/A1': ownedCard(),
      'answerKeys/A1': { answer: '59' },
    });

    const result = await submitAnswerHandler(
      authenticatedRequest({ cardId: 'A1', answer: '  59  ', confidence: 'medium' }),
    );

    expect(result.status).toBe('correct');
    expect(mockTxSet.mock.calls[0][1].answer).toBe('59');
  });

  test('ignores a client-supplied request.data.teamId and always uses the authenticated teamId claim', async () => {
    setupTransaction({
      'cards/A1': ownedCard({ currentOwner: 'TEAM-01' }),
      'answerKeys/A1': { answer: '59' },
    });

    // Authenticated as TEAM-01, but the request body attempts to claim TEAM-02.
    const result = await submitAnswerHandler(
      authenticatedRequest({ cardId: 'A1', answer: '59', confidence: 'high', teamId: 'TEAM-02' }, 'TEAM-01'),
    );

    // The submission is evaluated and recorded for TEAM-01, the authenticated team.
    expect(result).toEqual({ status: 'correct', pointsAwarded: 5 });
    expect(mockTxSet).toHaveBeenCalledWith(
      { __path: 'submissions/A1-TEAM-01-001' },
      expect.objectContaining({ teamId: 'TEAM-01', ownershipInstanceId: 'A1-TEAM-01-001' }),
    );
    expect(mockTxUpdate).toHaveBeenCalledWith({ __path: 'teams/TEAM-01' }, { score: { __increment: 5 } });

    // TEAM-02 is never referenced by any write - the spoofed teamId has no effect at all.
    expect(mockTxSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: expect.stringContaining('TEAM-02') }),
      expect.anything(),
    );
    expect(mockTxUpdate).not.toHaveBeenCalledWith({ __path: 'teams/TEAM-02' }, expect.anything());
    expect(JSON.stringify(mockTxSet.mock.calls)).not.toContain('TEAM-02');
  });
});
