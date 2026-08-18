const mockTeamsGet = jest.fn();
const mockCredDocGet = jest.fn();
const mockCardsGet = jest.fn();
const mockGetUser = jest.fn();
const mockCreateUser = jest.fn();
const mockSetCustomUserClaims = jest.fn();
const mockCreateCustomToken = jest.fn();

jest.mock('../src/config', () => {
  const teamsQuery = {
    where: jest.fn(function where() { return this; }),
    limit: jest.fn(function limit() { return this; }),
    get: (...args) => mockTeamsGet(...args),
  };

  const credDoc = { get: (...args) => mockCredDocGet(...args) };
  const credentialsCollection = { doc: jest.fn(() => credDoc) };

  const cardsQuery = {
    where: jest.fn(function where() { return this; }),
    get: (...args) => mockCardsGet(...args),
  };

  const collections = {
    teams: teamsQuery,
    teamCredentials: credentialsCollection,
    cards: cardsQuery,
  };

  return {
    db: {
      collection: jest.fn((name) => collections[name]),
    },
    auth: {
      getUser: mockGetUser,
      createUser: mockCreateUser,
      setCustomUserClaims: mockSetCustomUserClaims,
      createCustomToken: mockCreateCustomToken,
    },
  };
});

const { loginTeamHandler } = require('../src/auth/loginTeam');
const { hashPin } = require('../src/credentials/verifyPin');

function mockTeamFound({ teamId = 'TEAM-01', teamNumber = 1, teamName = 'Code Warriors' } = {}) {
  mockTeamsGet.mockResolvedValue({
    empty: false,
    docs: [{ id: teamId, data: () => ({ teamNumber, teamName }) }],
  });
}

function mockTeamNotFound() {
  mockTeamsGet.mockResolvedValue({ empty: true, docs: [] });
}

function mockCredential({ pinHash, active = true } = {}) {
  mockCredDocGet.mockResolvedValue({
    exists: true,
    data: () => ({ pinHash, active }),
  });
}

function mockNoCredential() {
  mockCredDocGet.mockResolvedValue({ exists: false });
}

function mockOwnedCards(cards = []) {
  mockCardsGet.mockResolvedValue({
    docs: cards.map((card) => ({ id: card.id, data: () => card.data })),
  });
}

describe('loginTeamHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a missing team number', async () => {
    await expect(loginTeamHandler({ data: { teamPin: '1234' } })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(mockTeamsGet).not.toHaveBeenCalled();
  });

  test('rejects a missing PIN', async () => {
    await expect(loginTeamHandler({ data: { teamNumber: 1 } })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(mockTeamsGet).not.toHaveBeenCalled();
  });

  test('rejects a malformed request body', async () => {
    await expect(loginTeamHandler({ data: null })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(loginTeamHandler({ data: 'not-an-object' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  test('rejects a malformed team number without leaking why', async () => {
    await expect(
      loginTeamHandler({ data: { teamNumber: 'abc', teamPin: '1234' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated', message: 'Invalid team credentials.' });
  });

  test('rejects a malformed PIN without leaking why', async () => {
    await expect(
      loginTeamHandler({ data: { teamNumber: 1, teamPin: 'not-digits' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated', message: 'Invalid team credentials.' });
  });

  test('rejects when no team matches the submitted number', async () => {
    mockTeamNotFound();

    await expect(
      loginTeamHandler({ data: { teamNumber: 99, teamPin: '1234' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated', message: 'Invalid team credentials.' });
  });

  test('rejects when the credential record does not exist', async () => {
    mockTeamFound();
    mockNoCredential();

    await expect(
      loginTeamHandler({ data: { teamNumber: 1, teamPin: '1234' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated', message: 'Invalid team credentials.' });
  });

  test('rejects an inactive team even with the correct PIN', async () => {
    mockTeamFound();
    const pinHash = await hashPin('1234');
    mockCredential({ pinHash, active: false });

    await expect(
      loginTeamHandler({ data: { teamNumber: 1, teamPin: '1234' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated', message: 'Invalid team credentials.' });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test('rejects an incorrect PIN', async () => {
    mockTeamFound();
    const pinHash = await hashPin('1234');
    mockCredential({ pinHash, active: true });

    await expect(
      loginTeamHandler({ data: { teamNumber: 1, teamPin: '9999' } }),
    ).rejects.toMatchObject({ code: 'unauthenticated', message: 'Invalid team credentials.' });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test('authenticates valid credentials, creates the auth user, sets the teamId claim, and returns a safe response', async () => {
    mockTeamFound({ teamId: 'TEAM-01', teamNumber: 1, teamName: 'Code Warriors' });
    const pinHash = await hashPin('1234');
    mockCredential({ pinHash, active: true });
    mockGetUser.mockRejectedValue({ code: 'auth/user-not-found' });
    mockCreateUser.mockResolvedValue({ uid: 'TEAM-01' });
    mockSetCustomUserClaims.mockResolvedValue();
    mockCreateCustomToken.mockResolvedValue('signed-custom-token');
    const ownedCard = {
      id: 'A1',
      data: { cardId: 'A1', title: 'Next in Line', tier: '1', currentOwner: 'TEAM-01', initialOwner: 'TEAM-01' },
    };
    mockOwnedCards([ownedCard]);

    const result = await loginTeamHandler({ data: { teamNumber: 1, teamPin: '1234' } });

    expect(mockCreateUser).toHaveBeenCalledWith({ uid: 'TEAM-01', disabled: false });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('TEAM-01', { teamId: 'TEAM-01' });
    expect(mockCreateCustomToken).toHaveBeenCalledWith('TEAM-01', { teamId: 'TEAM-01' });
    expect(mockCardsGet).toHaveBeenCalled();

    expect(result).toEqual({
      customToken: 'signed-custom-token',
      uid: 'TEAM-01',
      teamId: 'TEAM-01',
      teamNumber: 1,
      teamName: 'Code Warriors',
      ownedCards: [{ id: 'A1', ...ownedCard.data }],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/pinHash/i);
    expect(serialized).not.toContain('1234');
    expect(serialized).not.toMatch(/answer/i);
    expect(serialized).not.toMatch(/hiddenRule/i);
  });

  test('reuses the existing Firebase Auth user for a returning team', async () => {
    mockTeamFound();
    const pinHash = await hashPin('1234');
    mockCredential({ pinHash, active: true });
    mockGetUser.mockResolvedValue({ uid: 'TEAM-01' });
    mockSetCustomUserClaims.mockResolvedValue();
    mockCreateCustomToken.mockResolvedValue('signed-custom-token');
    mockOwnedCards([]);

    await loginTeamHandler({ data: { teamNumber: 1, teamPin: '1234' } });

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockGetUser).toHaveBeenCalledWith('TEAM-01');
  });

  test('the resolved identity always matches the authenticated team', async () => {
    mockTeamFound({ teamId: 'TEAM-04', teamNumber: 4, teamName: 'Binary Bandits' });
    const pinHash = await hashPin('4321');
    mockCredential({ pinHash, active: true });
    mockGetUser.mockResolvedValue({ uid: 'TEAM-04' });
    mockSetCustomUserClaims.mockResolvedValue();
    mockCreateCustomToken.mockResolvedValue('token-04');
    mockOwnedCards([]);

    const result = await loginTeamHandler({ data: { teamNumber: 4, teamPin: '4321' } });

    expect(result.teamId).toBe('TEAM-04');
    expect(result.uid).toBe('TEAM-04');
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('TEAM-04', { teamId: 'TEAM-04' });
  });

  test('queries owned cards by currentOwner for the authenticated team, not initialOwner', async () => {
    mockTeamFound({ teamId: 'TEAM-04', teamNumber: 4, teamName: 'Binary Bandits' });
    const pinHash = await hashPin('4321');
    mockCredential({ pinHash, active: true });
    mockGetUser.mockResolvedValue({ uid: 'TEAM-04' });
    mockSetCustomUserClaims.mockResolvedValue();
    mockCreateCustomToken.mockResolvedValue('token-04');
    mockOwnedCards([]);

    await loginTeamHandler({ data: { teamNumber: 4, teamPin: '4321' } });

    const cardsCollection = require('../src/config').db.collection('cards');
    expect(cardsCollection.where).toHaveBeenCalledWith('currentOwner', '==', 'TEAM-04');
  });

  test('rejects when fetching owned cards fails, without leaking internal details', async () => {
    mockTeamFound();
    const pinHash = await hashPin('1234');
    mockCredential({ pinHash, active: true });
    mockGetUser.mockResolvedValue({ uid: 'TEAM-01' });
    mockSetCustomUserClaims.mockResolvedValue();
    mockCreateCustomToken.mockResolvedValue('signed-custom-token');
    mockCardsGet.mockRejectedValue(new Error('firestore unavailable'));

    await expect(
      loginTeamHandler({ data: { teamNumber: 1, teamPin: '1234' } }),
    ).rejects.toMatchObject({ code: 'internal' });
  });
});
