import { NextResponse } from 'next/server';
import { expiredAccountCookie, requestHasValidOrigin, revokeRequestSession } from '@/lib/account-auth';

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 });
  try {
    await revokeRequestSession(request);
    const response = NextResponse.json({ ok: true });
    response.headers.set('Set-Cookie', expiredAccountCookie(request));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Account logout failed:', error);
    return NextResponse.json({ error: '退出登录失败。' }, { status: 500 });
  }
}
