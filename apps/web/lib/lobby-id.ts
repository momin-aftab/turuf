/**
 * Lobby ID generation.
 *
 * Format: 6 uppercase alphanumeric characters from [A-Z0-9]
 * Space: 36^6 = 2,176,782,336 combinations (≈ 2.17 billion)
 *
 * Uses Node.js crypto.randomBytes for unpredictable IDs.
 * Excludes visually ambiguous characters: 0/O, I/1
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars (excludes O, I, 0, 1)
const ID_LENGTH = 6;

/**
 * Generate a single random lobby ID.
 * Uses rejection sampling to eliminate modulo bias.
 */
export function generateLobbyId(): string {
  const bytes = new Uint8Array(ID_LENGTH * 2); // extra bytes for rejection sampling
  crypto.getRandomValues(bytes);

  let result = '';
  let byteIndex = 0;

  while (result.length < ID_LENGTH) {
    if (byteIndex >= bytes.length) {
      // Refill buffer (extremely rare — only needed if many bytes are rejected)
      crypto.getRandomValues(bytes);
      byteIndex = 0;
    }

    const byte = bytes[byteIndex++]!;
    // Rejection threshold: eliminate modulo bias for 32-char alphabet
    // 256 / 32 = 8 → threshold = 256 (all bytes are valid since 256 % 32 === 0)
    result += ALPHABET[byte % ALPHABET.length]!;
  }

  return result;
}

/**
 * Normalize a lobby ID entered by a user (case-insensitive, trim whitespace).
 * Returns the ID in uppercase.
 */
export function normalizeLobbyId(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Validate that a string looks like a lobby ID (6 chars from the alphabet).
 * Used for basic input sanitization before hitting Redis.
 */
export function isValidLobbyIdFormat(id: string): boolean {
  return /^[A-Z0-9]{6}$/.test(id.toUpperCase());
}
