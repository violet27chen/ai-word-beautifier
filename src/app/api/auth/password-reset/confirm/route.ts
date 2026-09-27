import { NextResponse } from 'next/server';
import { consumeAccountToken, updateAccountPassword } from '@/lib/user-db';
import { accountCookie, allowAuthAttempt, hashPassword, hashSessionToken, issueAccountSession, requestHasValidOrigin, validPassword } from '@/lib/account-auth';

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 });
  try {
    if (!await allowAuthAttempt(request)) return NextResponse.json({ error: '操作过于频繁，请 15 分钟后再试。' }, { status: 429 });
    const body = await request.json() as { token?: unknown; password?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[a-f0-9]{64}$/i.test(token) || !validPassword(password)) {
      return NextResponse.json({ error: '重置链接无效，或密码不符合安全要求（至少 8 个字符，并包含至少 3 种字符类型）。' }, { status: 400 });
    }
    const user = await consumeAccountToken(await hashSessionToken(token), 'reset_password');
    if (!user) return NextResponse.json({ error: '重置链接已失效，请重新申请。' }, { status: 400 });
    const secret = await hashPassword(password);
    await updateAccountPassword(user.id, secret.hash, secret.salt);
    const sessionToken = await issueAccountSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, email: user.email } });
    response.headers.set('Set-Cookie', accountCookie(sessionToken, request));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Password reset confirmation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: '密码重置失败，请稍后重试。' }, { status: 500 });
  }
}
