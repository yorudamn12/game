const { getOwnedCards } = require('../src/teams/getOwnedCards');

function makeDb(docs) {
  const where = jest.fn(function whereImpl() { return this; });
  const get = jest.fn().mockResolvedValue({
    docs: docs.map((doc) => ({ id: doc.id, data: () => doc.data })),
  });

  const collection = jest.fn(() => ({ where, get }));

  return { db: { collection }, where, get };
}

describe('getOwnedCards', () => {
  test('queries the cards collection by currentOwner', async () => {
    const { db, where } = makeDb([]);

    await getOwnedCards(db, 'TEAM-04');

    expect(db.collection).toHaveBeenCalledWith('cards');
    expect(where).toHaveBeenCalledWith('currentOwner', '==', 'TEAM-04');
  });

  test('maps each matching document to {id, ...data}', async () => {
    const { db } = makeDb([
      { id: 'D1', data: { cardId: 'D1', tier: '1', currentOwner: 'TEAM-04' } },
      { id: 'D2', data: { cardId: 'D2', tier: '2', currentOwner: 'TEAM-04' } },
    ]);

    const cards = await getOwnedCards(db, 'TEAM-04');

    expect(cards).toEqual([
      { id: 'D1', cardId: 'D1', tier: '1', currentOwner: 'TEAM-04' },
      { id: 'D2', cardId: 'D2', tier: '2', currentOwner: 'TEAM-04' },
    ]);
  });

  test('returns an empty array when the team owns no cards', async () => {
    const { db } = makeDb([]);

    const cards = await getOwnedCards(db, 'TEAM-04');

    expect(cards).toEqual([]);
  });
});
