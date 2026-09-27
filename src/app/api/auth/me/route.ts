import { NextResponse } from 'next/server';
import { getRequestAccount } from '@/lib/account-auth';

export async function GET(request: Request) {
  try {
    const user = await getRequestAccount(request);
    const response = NextResponse.json({ user: user ? { id: user.id, email: user.email } : null });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Account session lookup failed:', error);
    return NextResponse.json({ error: '暂时无法读取登录状态。' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
