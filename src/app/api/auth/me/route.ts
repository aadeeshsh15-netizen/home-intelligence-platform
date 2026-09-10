import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const sessionUser = await getAuthenticatedUser(req);

  if (!sessionUser) {
    return NextResponse.json(
      { error: 'Unauthorized. Valid session token required.' },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      homes: {
        select: {
          id: true,
          name: true,
          timezone: true,
          address: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User record not found' }, { status: 404 });
  }

  return NextResponse.json({
    user,
  });
}
