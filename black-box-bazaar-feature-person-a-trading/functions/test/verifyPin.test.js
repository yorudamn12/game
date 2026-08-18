const { hashPin, verifyPin } = require('../src/credentials/verifyPin');

describe('verifyPin', () => {
  test('hashPin never returns the plaintext PIN', async () => {
    const hash = await hashPin('1234');
    expect(hash).not.toBe('1234');
    expect(typeof hash).toBe('string');
  });

  test('verifyPin returns true for the correct PIN', async () => {
    const hash = await hashPin('1234');
    await expect(verifyPin('1234', hash)).resolves.toBe(true);
  });

  test('verifyPin returns false for an incorrect PIN', async () => {
    const hash = await hashPin('1234');
    await expect(verifyPin('9999', hash)).resolves.toBe(false);
  });

  test('verifyPin returns false when there is no stored hash', async () => {
    await expect(verifyPin('1234', undefined)).resolves.toBe(false);
    await expect(verifyPin('1234', null)).resolves.toBe(false);
    await expect(verifyPin('1234', '')).resolves.toBe(false);
  });

  test('verifyPin never throws on a malformed stored hash', async () => {
    await expect(verifyPin('1234', 'not-a-real-hash')).resolves.toBe(false);
  });
});
