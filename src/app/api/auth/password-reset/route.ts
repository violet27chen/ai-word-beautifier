import { NextResponse } from 'next/server';
import { allowAuthAttempt, normalizeEmail, requestHasValidOrigin, sendAccountActionEmail, validEmail } from '@/lib/account-auth';
import { findAccountByEmailForMail } from '@/lib/user-db';

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 });
  try {
    if (!await allowAuthAttempt(request)) return NextResponse.json({ error: '操作过于频繁，请 15 分钟后再试。' }, { status: 429 });
    const body = await request.json() as { email?: unknown };
    const email = normalizeEmail(body.email);
    if (validEmail(email)) {
      const user = await findAccountByEmailForMail(email);
      if (user?.status === 'active' && user.emailVerified) {
        try {
          await sendAccountActionEmail(user, 'reset_password', request);
        } catch (error) {
          console.error('Password reset email failed:', error instanceof Error ? error.message : 'unknown error');
        }
      }
    }
    return NextResponse.json({ ok: true, message: '如果该邮箱对应已验证账号，密码重置邮件将会发送。' });
  } catch (error) {
    console.error('Password reset request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: '暂时无法处理请求，请稍后重试。' }, { status: 500 });
  }
}
