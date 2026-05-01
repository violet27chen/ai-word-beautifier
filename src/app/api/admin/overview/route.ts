import { NextResponse } from 'next/server';
import { getAdminOverview } from '@/lib/admin-metrics';

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || 'admin123';
}

function validateAdmin(req: Request) {
  const headerPassword = req.headers.get('x-admin-password')?.trim() || '';
  const url = new URL(req.url);
  const queryPassword = url.searchParams.get('password')?.trim() || '';
  const password = headerPassword || queryPassword;
  return password && password === getAdminPassword();
}

function buildEnvStatus() {
  return {
    zhipu: Boolean(process.env.ZHIPU_API_KEY?.trim()),
    moonshot: Boolean(process.env.MOONSHOT_API_KEY?.trim()),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    doubao: Boolean((process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY || '').trim()),
    dashscope: Boolean(process.env.DASHSCOPE_API_KEY?.trim()),
    mcpSearch: Boolean(process.env.MCP_SEARCH_ENDPOINT?.trim()),
  };
}

export async function GET(req: Request) {
  if (!validateAdmin(req)) {
    return NextResponse.json({ error: '管理后台认证失败' }, { status: 401 });
  }
  return NextResponse.json({
    project: 'AI Word 排版美化助手',
    now: new Date().toISOString(),
    envStatus: buildEnvStatus(),
    overview: getAdminOverview(),
  });
}
