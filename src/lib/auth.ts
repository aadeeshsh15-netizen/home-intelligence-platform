import crypto from 'crypto';
import { prisma } from './db';
import { NextRequest } from 'next/server';

const SECRET_KEY = process.env.APP_SECRET || 'super-secret-production-grade-key-for-home-intel-platform-32char';

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  homeId: string;
  exp: number; // Unix epoch seconds
}

export interface SessionUser {
  userId: string;
  email: string;
  role: string;
  homeId: string;
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export function generateSessionToken(
  user: { id: string; email: string; role: string },
  homeId: string,
  expiresInHours: number = 72
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    homeId,
    exp,
  };

  const jsonPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(jsonPayload)
    .digest('base64url');

  return `${jsonPayload}.${signature}`;
}

/**
 * Verifies the integrity and expiration of a session token.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [jsonPayload, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(jsonPayload)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(Buffer.from(jsonPayload, 'base64url').toString('utf8'));

    // Check expiration
    if (Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies session user from incoming Request headers or cookies.
 */
export async function getAuthenticatedUser(req: Request | NextRequest): Promise<SessionUser | null> {
  const url = new URL(req.url);

  // If request explicitly asks for anonymous testing via query param, simulate unauthorized
  if (url.searchParams.get('auth') === 'anonymous') {
    return null;
  }

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = verifySessionToken(token);
    if (payload) return payload;
    // Invalid bearer token explicitly provided -> reject
    return null;
  }

  // 2. Check x-api-key header
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    const payload = verifySessionToken(apiKey);
    if (payload) return payload;
    return null;
  }

  // 3. Check Cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/session_token=([^;]+)/);
  if (match) {
    const token = match[1];
    const payload = verifySessionToken(token);
    if (payload) return payload;
  }

  // 4. Default fallback for development/demo UI browsing
  // In development, if no auth token is passed, bind to the seeded owner user for seamless UI usage
  if (process.env.NODE_ENV !== 'production') {
    const defaultUser = await prisma.user.findFirst({
      include: { homes: true },
    });
    if (defaultUser && defaultUser.homes.length > 0) {
      return {
        userId: defaultUser.id,
        email: defaultUser.email,
        role: defaultUser.role,
        homeId: defaultUser.homes[0].id,
      };
    }
  }

  return null;
}

/**
 * Validates that the requesting user is authenticated and authorized to access the requested home.
 */
export async function enforceHomeAccess(
  req: Request | NextRequest,
  targetHomeId?: string
): Promise<{ authorized: boolean; user?: SessionUser; error?: string; status?: number }> {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return {
      authorized: false,
      error: 'Authentication Required. Please provide a valid session cookie or Bearer token.',
      status: 401,
    };
  }

  // If a specific homeId was requested, enforce that the user owns it or has access
  if (targetHomeId && targetHomeId !== user.homeId) {
    const home = await prisma.home.findFirst({
      where: {
        id: targetHomeId,
        ownerId: user.userId,
      },
    });

    if (!home) {
      return {
        authorized: false,
        error: `Forbidden. You do not have authorization to access Home ID ${targetHomeId}.`,
        status: 403,
      };
    }
  }

  return { authorized: true, user };
}
