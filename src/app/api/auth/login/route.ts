import { NextResponse } from 'next/server';
import { accountCookie, allowAuthAttempt, issueAccountSession, normalizeEmail, requestHasValidOrigin, validEmail, verifyPassword } from '@/lib/account-auth';
import { findAccountByEmail } from '@/lib/user-db';

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 });
  try {
    if (!await allowAuthAttempt(request)) return NextResponse.json({ error: '操作过于频繁，请 15 分钟后再试。' }, { status: 429 });
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!validEmail(email) || password.length > 128 || !password) {
      return NextResponse.json({ error: '邮箱或密码错误。' }, { status: 401 });
    }
    const user = await findAccountByEmail(email);
    const matches = user
      ? await verifyPassword(password, user.passwordSalt, user.passwordHash)
      : await verifyPassword(password, '00112233445566778899aabbccddeeff', '00'.repeat(32));
    if (!user || !matches || user.status !== 'active') {
      return NextResponse.json({ error: '邮箱或密码错误，或账号暂不可用。' }, { status: 401 });
    }
    if (!user.emailVerified) return NextResponse.json({ error: '邮箱尚未验证，请先完成验证或申请重发邮件。' }, { status: 403 });
    const token = await issueAccountSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, email: user.email } });
    response.headers.set('Set-Cookie', accountCookie(token, request));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Account login failed:', error);
    return NextResponse.json({ error: '登录暂时无法完成，请稍后重试。' }, { status: 500 });
  }
}
