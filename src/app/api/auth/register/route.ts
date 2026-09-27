import { NextResponse } from 'next/server';
import { allowAuthAttempt, hashPassword, normalizeEmail, requestHasValidOrigin, sendAccountActionEmail, validEmail } from '@/lib/account-auth';
import { createAccount } from '@/lib/user-db';

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 });
  try {
    if (!await allowAuthAttempt(request)) return NextResponse.json({ error: '操作过于频繁，请 15 分钟后再试。' }, { status: 429 });
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!validEmail(email)) return NextResponse.json({ error: '请输入有效的邮箱地址。' }, { status: 400 });
    if (password.length < 10 || password.length > 128) return NextResponse.json({ error: '密码长度需为 10–128 个字符。' }, { status: 400 });
    const secret = await hashPassword(password);
    const user = await createAccount({ email, passwordHash: secret.hash, passwordSalt: secret.salt });
    try {
      await sendAccountActionEmail(user, 'verify_email', request);
    } catch {
      return NextResponse.json({ error: '账号已创建，但验证邮件发送失败。请稍后在登录页申请重发。', verificationRequired: true }, { status: 503 });
    }
    const response = NextResponse.json({ verificationRequired: true }, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/unique|duplicate/i.test(message)) return NextResponse.json({ error: '该邮箱已注册，请直接登录。' }, { status: 409 });
    console.error('Account registration failed:', error);
    return NextResponse.json({ error: '注册暂时无法完成，请稍后重试。' }, { status: 500 });
  }
}
