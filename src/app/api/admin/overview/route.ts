import { NextResponse } from 'next/server';
import { getAdminOverview } from '@/lib/admin-metrics';

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || '';
}

function validateAdmin(req: Request) {
  const headerPassword = req.headers.get('x-admin-password')?.trim() || '';
  return Boolean(headerPassword && headerPassword === getAdminPassword());
}

function buildEnvStatus() {
  return {
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    mcpSearch: Boolean(process.env.MCP_SEARCH_ENDPOINT?.trim()),
  };
}

export async function GET(req: Request) {
  if (!getAdminPassword() || !validateAdmin(req)) {
    return NextResponse.json({ error: '管理后台认证失败' }, { status: 401 });
  }
  return NextResponse.json({
    project: 'AI Word 排版美化助手',
    now: new Date().toISOString(),
    envStatus: buildEnvStatus(),
    overview: await getAdminOverview(),
  });
}
