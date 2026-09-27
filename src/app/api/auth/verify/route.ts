import { NextResponse } from 'next/server';
import { consumeAccountToken, markAccountEmailVerified } from '@/lib/user-db';
import { hashSessionToken, issueAccountSession, accountCookie } from '@/lib/account-auth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const destination = new URL('/account', url.origin);
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    destination.searchParams.set('verified', 'invalid');
    return NextResponse.redirect(destination, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  try {
    const user = await consumeAccountToken(await hashSessionToken(token), 'verify_email');
    if (!user) {
      destination.searchParams.set('verified', 'invalid');
      return NextResponse.redirect(destination, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    await markAccountEmailVerified(user.id);
    const sessionToken = await issueAccountSession(user.id);
    destination.searchParams.set('verified', '1');
    const response = NextResponse.redirect(destination, { status: 303 });
    response.headers.set('Set-Cookie', accountCookie(sessionToken, request));
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    console.error('Email verification failed:', error instanceof Error ? error.message : 'unknown error');
    destination.searchParams.set('verified', 'error');
    return NextResponse.redirect(destination, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
}
