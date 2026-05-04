import { NextResponse } from 'next/server';
import { trackAdminVisit } from '@/lib/admin-metrics';

function getClientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',').map((item) => item.trim()).filter(Boolean)[0] || '';
  return firstForwarded || req.headers.get('x-real-ip') || 'unknown-ip';
}

function buildVisitorKey(ip: string, userAgent: string) {
  return `${ip}::${userAgent}`.slice(0, 240).toLowerCase();
}

export async function POST(req: Request) {
  const userAgent = req.headers.get('user-agent') || 'unknown-ua';
  const ip = getClientIp(req);
  const visitorKey = buildVisitorKey(ip, userAgent);
  await trackAdminVisit({ visitorKey });
  return NextResponse.json({ ok: true });
}
