const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

/**
 * Hashes a plaintext PIN for storage. The plaintext PIN itself must
 * never be persisted - only the returned hash may be stored.
 */
async function hashPin(plainPin) {
  return bcrypt.hash(plainPin, SALT_ROUNDS);
}

/**
 * Verifies a submitted plaintext PIN against a stored hash.
 * Never throws - any comparison failure (including a malformed
 * stored hash) is treated as a non-match.
 */
async function verifyPin(plainPin, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash) {
    return false;
  }

  try {
    return await bcrypt.compare(plainPin, storedHash);
  } catch {
    return false;
  }
}

module.exports = { hashPin, verifyPin };
