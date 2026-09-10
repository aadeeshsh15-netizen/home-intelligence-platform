import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { generateSessionToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { homes: true },
    });

    if (!user) {
      logger.warn('Failed login attempt: user not found', { email, module: 'auth' });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      logger.warn('Failed login attempt: incorrect password', { email, module: 'auth' });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const homeId = user.homes.length > 0 ? user.homes[0].id : '';
    const token = generateSessionToken(user, homeId, 72);

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      homeId,
      module: 'auth',
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        homeId,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 72 * 3600, // 3 days
    });

    return response;
  } catch (error: any) {
    logger.error('Login error', { module: 'auth' }, error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
