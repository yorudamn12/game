const { validateSeedData } = require('../src/seedData/validateSeedData');

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
        tier: '2',
        initialOwner: teamId,
        currentOwner: teamId,
        status: 'owned',
        pointsCorrect: 10,
        pointsWrong: -2,
      });
      answers[cardId] = { answer: '42' };
    }
  });

  return { event: { teams, cards }, answers };
}

describe('validateSeedData', () => {
  test('accepts a well-formed 14-team / 56-card dataset', () => {
    const { event, answers } = buildValidFixture();

    const result = validateSeedData(event, answers);

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('rejects a team count other than 14', () => {
    const { event, answers } = buildValidFixture();
    event.teams.pop();

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Expected exactly 14 teams')]));
  });

  test('rejects a card count other than 56', () => {
    const { event, answers } = buildValidFixture();
    event.cards.pop();

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Expected exactly 56 cards')]));
  });

  test('rejects a team with a card count other than 4', () => {
    const { event, answers } = buildValidFixture();
    event.cards[0].initialOwner = 'TEAM-02';

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('TEAM-01 has 3 initial cards'),
        expect.stringContaining('TEAM-02 has 5 initial cards'),
      ]),
    );
  });

  test('rejects a card with no corresponding answer', () => {
    const { event, answers } = buildValidFixture();
    delete answers['A1'];

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('A1 has no corresponding entry in answers')]),
    );
  });

  test('rejects an answer entry with no answer value', () => {
    const { event, answers } = buildValidFixture();
    answers['A1'] = { unconfirmedRule: true };

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('A1 has an answers entry but no answer value')]),
    );
  });

  test('rejects a duplicate card ID', () => {
    const { event, answers } = buildValidFixture();
    event.cards.push({ ...event.cards[0] });

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Duplicate card ID: A1')]));
  });

  test('rejects an invalid tier', () => {
    const { event, answers } = buildValidFixture();
    event.cards[0].tier = 'medium';

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('A1 has invalid tier: medium')]),
    );
  });

  test('rejects a card with no initialOwner', () => {
    const { event, answers } = buildValidFixture();
    delete event.cards[0].initialOwner;

    const result = validateSeedData(event, answers);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('A1 has no initialOwner')]),
    );
  });
});
