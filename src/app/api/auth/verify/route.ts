import { NextResponse } from 'next/server';
import { consumeAccountToken, markAccountEmailVerified } from '@/lib/user-db';
import { accountCookie, allowAuthAttempt, hashSessionToken, issueAccountSession, normalizeEmail, requestHasValidOrigin, validEmail } from '@/lib/account-auth';

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 });
  try {
    if (!await allowAuthAttempt(request)) return NextResponse.json({ error: '操作过于频繁，请 15 分钟后再试。' }, { status: 429 });
    const body = await request.json() as { email?: unknown; code?: unknown };
    const email = normalizeEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: '请输入有效邮箱和 6 位验证码。' }, { status: 400 });
    }
    const user = await consumeAccountToken(await hashSessionToken(`${email}:${code}`), 'verify_email');
    if (!user || user.email !== email || user.emailVerified) {
      return NextResponse.json({ error: '验证码无效或已过期，请重新获取。' }, { status: 400 });
    }
    await markAccountEmailVerified(user.id);
    const sessionToken = await issueAccountSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, email: user.email } });
    response.headers.set('Set-Cookie', accountCookie(sessionToken, request));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Email code verification failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: '邮箱验证暂时失败，请稍后重试。' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

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
