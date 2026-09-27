import { NextResponse } from 'next/server';
import { getAdminAccounts, updateAccountStatus } from '@/lib/user-db';

function authorized(request: Request) {
  const expected = process.env.ADMIN_PASSWORD?.trim() || '';
  const received = request.headers.get('x-admin-password')?.trim() || '';
  return Boolean(expected && received && expected === received);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '管理后台认证失败' }, { status: 401 });
  try {
    return NextResponse.json(await getAdminAccounts(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Admin user query failed:', error);
    return NextResponse.json({ error: '读取用户数据失败' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: '管理后台认证失败' }, { status: 401 });
  try {
    const body = await request.json() as { id?: unknown; status?: unknown };
    if (typeof body.id !== 'string' || !/^[\da-f-]{36}$/i.test(body.id) || (body.status !== 'active' && body.status !== 'disabled')) {
      return NextResponse.json({ error: '用户状态参数无效。' }, { status: 400 });
    }
    await updateAccountStatus(body.id, body.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin user update failed:', error);
    return NextResponse.json({ error: '更新用户状态失败。' }, { status: 500 });
  }
}
