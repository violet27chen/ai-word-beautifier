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
      if (user?.status === 'active' && !user.emailVerified) {
        try {
          await sendAccountActionEmail(user, 'verify_email', request);
        } catch (error) {
          console.error('Verification email resend failed:', error instanceof Error ? error.message : 'unknown error');
        }
      }
    }
    return NextResponse.json({ ok: true, message: '如该邮箱对应未验证账号，验证码已重新发送，请查收邮件。' });
  } catch (error) {
    console.error('Verification email request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: '暂时无法处理请求，请稍后重试。' }, { status: 500 });
  }
}
