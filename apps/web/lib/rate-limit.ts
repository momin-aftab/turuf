/**
 * Rate limiting using @upstash/ratelimit (sliding window algorithm).
 *
 * All limiters share the same Redis instance but use distinct key prefixes.
 * Returns a standard Next.js Response on rate limit violation (429).
 */

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';
import { errorResponse } from '@/lib/response';
import { NextRequest } from 'next/server';

// ─── Limiter instances ────────────────────────────────────────────────────────

/** Lobby creation: 5 requests per IP per minute */
export const lobbyCreateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'rl:lobby:create',
  analytics: false,
});

/** Join lobby: 20 requests per IP per minute */
export const lobbyJoinLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:lobby:join',
  analytics: false,
});

/** Game action (card play, trump): 60 per player per minute */
export const gameActionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:game:action',
  analytics: false,
});

/** Chat message: 10 per player per minute */
export const chatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:chat',
  analytics: false,
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Run a rate limiter check and return a 429 Response if the limit is exceeded.
 * Returns null if the request is within limits (caller should continue).
 *
 * @param limiter    - The Ratelimit instance to check
 * @param identifier - Unique key for this client (IP address or playerId)
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<Response | null> {
  const { success, reset } = await limiter.limit(identifier);
  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return errorResponse('RATE_LIMITED', 'Too many requests. Please slow down.', 429, {
      'Retry-After': String(retryAfter),
    });
  }
  return null;
}

/**
 * Get the best available client identifier for rate limiting.
 * Prefers forwarded IP (Vercel sets x-forwarded-for), falls back to a static key.
 */
export function getClientIdentifier(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}
