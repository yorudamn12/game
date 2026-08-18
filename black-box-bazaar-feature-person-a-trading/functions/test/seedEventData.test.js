const { seedEventData, AlreadySeededError, InvalidSeedDataError } = require('../src/seedData/seedEventData');
const { GAME_DOC_ID } = require('../src/seedData/buildSeedDocuments');

function buildValidFixture() {
  const teams = [];
  const cards = [];
  const answers = {};
  const letters = 'ABCDEFGHIJKLMN'.split('');

  letters.forEach((letter, i) => {
    const teamId = `TEAM-${String(i + 1).padStart(2, '0')}`;
    teams.push({ teamId, teamNumber: i + 1, cardIds: [1, 2, 3, 4].map((n) => `${letter}${n}`) });
    for (let n = 1; n <= 4; n += 1) {
      const cardId = `${letter}${n}`;
      cards.push({
        cardId,
        title: `Puzzle ${cardId}`,
        tier: '2',
        initialOwner: teamId,
        currentOwner: teamId,
        status: 'owned',
        pointsCorrect: 10,
        pointsWrong: -2,
        examples: [{ input: '1', output: '2' }],
        finalInput: '3',
        question: 'Study the pattern.',
      });
      answers[cardId] = { answer: '42' };
    }
  });

  return { event: { teams, cards }, answers };
}

function makeMockDb({ gameExists }) {
  const getGame = jest.fn().mockResolvedValue({ exists: gameExists });
  const set = jest.fn();
  const commit = jest.fn().mockResolvedValue(undefined);

  const collection = jest.fn((name) => ({
    doc: jest.fn((id) => {
      const ref = { __path: `${name}/${id}` };
      if (name === 'game' && id === GAME_DOC_ID) {
        ref.get = getGame;
      }
      return ref;
    }),
  }));

  const db = {
    collection,
    batch: jest.fn(() => ({ set, commit })),
  };

  return { db, set, commit, getGame };
}

const mockAdmin = {
  firestore: { FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') } },
};

describe('seedEventData', () => {
  test('rejects invalid seed data before touching Firestore', async () => {
    const { event, answers } = buildValidFixture();
    event.teams.pop(); // now only 13 teams - invalid
    const { db, set, commit, getGame } = makeMockDb({ gameExists: false });

    await expect(seedEventData({ db, admin: mockAdmin, event, answers })).rejects.toThrow(InvalidSeedDataError);

    expect(getGame).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  test('refuses to reseed an already-seeded event', async () => {
    const { event, answers } = buildValidFixture();
    const { db, set, commit } = makeMockDb({ gameExists: true });

    await expect(seedEventData({ db, admin: mockAdmin, event, answers })).rejects.toThrow(AlreadySeededError);

    expect(set).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  test('writes teams, cards, answerKeys, and game in a single batch on a fresh event', async () => {
    const { event, answers } = buildValidFixture();
    const { db, set, commit } = makeMockDb({ gameExists: false });

    const result = await seedEventData({ db, admin: mockAdmin, event, answers });

    expect(result).toEqual({ teams: 14, cards: 56, answerKeys: 56, game: GAME_DOC_ID });
    // 14 teams + 56 cards + 56 answerKeys + 1 game doc
    expect(set).toHaveBeenCalledTimes(14 + 56 + 56 + 1);
    expect(commit).toHaveBeenCalledTimes(1);

    const teamCall = set.mock.calls.find(([ref]) => ref.__path === 'teams/TEAM-01');
    expect(teamCall[1]).toMatchObject({ teamNumber: 1, teamName: 'Team 01', score: 0, bitBucks: 100, createdAt: 'SERVER_TIMESTAMP' });

    const cardCall = set.mock.calls.find(([ref]) => ref.__path === 'cards/A1');
    expect(cardCall[1]).toMatchObject({ initialOwner: 'TEAM-01', currentOwner: 'TEAM-01', createdAt: 'SERVER_TIMESTAMP' });

    const answerCall = set.mock.calls.find(([ref]) => ref.__path === 'answerKeys/A1');
    expect(answerCall[1]).toEqual({ answer: '42' });
    expect(answerCall[1].createdAt).toBeUndefined();

    const gameCall = set.mock.calls.find(([ref]) => ref.__path === `game/${GAME_DOC_ID}`);
    expect(gameCall[1]).toMatchObject({ phase: 'CHECK_IN', isActive: true, updatedAt: 'SERVER_TIMESTAMP' });
  });
});
