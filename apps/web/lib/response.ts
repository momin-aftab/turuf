/**
 * Standard API response helpers for Next.js Route Handlers.
 * All responses use the { data, error } envelope defined in @/types.
 */

import { NextResponse } from 'next/server';
import type { ApiError, ApiSuccess } from '@/types';

// ─── Success ──────────────────────────────────────────────────────────────────

export function successResponse<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, error: null }, { status });
}

// ─── Error ────────────────────────────────────────────────────────────────────

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  headers?: Record<string, string>
): NextResponse<ApiError> {
  return NextResponse.json(
    { data: null, error: { code, message } },
    { status, headers }
  );
}

// ─── Common error shortcuts ───────────────────────────────────────────────────

export const Errors = {
  unauthorized: (msg = 'Authentication required') =>
    errorResponse('UNAUTHORIZED', msg, 401),

  forbidden: (msg = 'You do not have permission to perform this action') =>
    errorResponse('FORBIDDEN', msg, 403),

  notFound: (resource = 'Resource') =>
    errorResponse('NOT_FOUND', `${resource} not found or has expired`, 404),

  conflict: (msg: string) =>
    errorResponse('CONFLICT', msg, 409),

  unprocessable: (code: string, msg: string) =>
    errorResponse(code, msg, 422),

  serverError: (msg = 'Internal server error. Please try again.') =>
    errorResponse('SERVER_ERROR', msg, 500),

  serviceUnavailable: (msg = 'Server is busy. Please retry in a moment.') =>
    errorResponse('SERVICE_UNAVAILABLE', msg, 503),
} as const;

// ─── Auth error handler ───────────────────────────────────────────────────────

import { AuthError } from '@/lib/auth';

export function handleAuthError(err: unknown): NextResponse<ApiError> {
  if (err instanceof AuthError) {
    return errorResponse(err.code, err.message, 401);
  }
  return Errors.serverError();
}
