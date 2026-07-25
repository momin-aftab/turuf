/**
 * JWT utilities for Turuf player session tokens.
 *
 * Uses the `jose` library which works in both Edge Runtime and Node.js.
 * Tokens are HS256-signed with a server-side secret.
 *
 * Token payload: { lobbyId, playerId, seat }
 * Expiry: 24 hours (matching Redis lobby TTL)
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { TurufJWT } from '@/types';
import type { Seat } from '@turuf/game-engine';

const getSecret = (): Uint8Array => {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
};

// ─── Sign ─────────────────────────────────────────────────────────────────────

/**
 * Sign a new player session JWT.
 * Called when a player successfully joins a lobby.
 */
export async function signPlayerToken(payload: TurufJWT): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export interface VerifiedToken {
  lobbyId: string;
  playerId: string;
  seat: Seat;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'MISSING_TOKEN' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Verify a player JWT from the Authorization header.
 * Throws AuthError if the token is missing, invalid, or expired.
 */
export async function verifyPlayerToken(authHeader: string | null): Promise<VerifiedToken> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header', 'MISSING_TOKEN');
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getSecret());

    if (
      typeof payload['lobbyId'] !== 'string' ||
      typeof payload['playerId'] !== 'string' ||
      typeof payload['seat'] !== 'number'
    ) {
      throw new AuthError('Token payload is missing required claims', 'INVALID_TOKEN');
    }

    return {
      lobbyId: payload['lobbyId'] as string,
      playerId: payload['playerId'] as string,
      seat: payload['seat'] as Seat,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new AuthError('Token has expired — please refresh the page', 'EXPIRED_TOKEN');
    }
    throw new AuthError('Invalid token signature', 'INVALID_TOKEN');
  }
}

/**
 * Extract and verify the JWT from a Next.js Request object.
 * Convenience wrapper used in route handlers.
 */
export async function requireAuth(req: Request): Promise<VerifiedToken> {
  return verifyPlayerToken(req.headers.get('Authorization'));
}
