'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, KeyRound, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

type EnvStatus = {
  zhipu: boolean;
  moonshot: boolean;
  deepseek: boolean;
  doubao: boolean;
  dashscope: boolean;
  mcpSearch: boolean;
};

type AdminEvent = {
  id: string;
  type: 'generate' | 'download';
  status: 'success' | 'error';
  model?: string;
  hasImages?: boolean;
  promptLength?: number;
  markdownLength?: number;
  errorMessage?: string;
  createdAt: string;
};

type OverviewPayload = {
  project: string;
  now: string;
  envStatus: EnvStatus;
  overview: {
    startedAt: string;
    totalRequests: number;
    generate: { total: number; success: number; error: number; successRate: number };
    download: { total: number; success: number; error: number; successRate: number };
    traffic: {
      totalVisits: number;
      uniqueVisitors: number;
      todayVisits: number;
      todayUniqueVisitors: number;
      last7Days: Array<{ date: string; visits: number; uniqueVisitors: number }>;
    };
    recentEvents: AdminEvent[];
  };
};

const STORAGE_KEY = 'admin_password_cache';

function statusColor(value: boolean) {
  return value ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200';
}

function formatDateTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')} ${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}:${`${d.getSeconds()}`.padStart(2, '0')}`;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<OverviewPayload | null>(null);

  const fetchOverview = async (pass: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/overview', {
        method: 'GET',
        headers: {
          'x-admin-password': pass,
        },
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? '密码错误' : '获取数据失败');
      }
      const data = await response.json() as OverviewPayload;
      setPayload(data);
      setAuthorized(true);
      setPassword(pass);
      window.sessionStorage.setItem(STORAGE_KEY, pass);
    } catch (e) {
      const err = e as Error;
      setAuthorized(false);
      setPayload(null);
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = window.sessionStorage.getItem(STORAGE_KEY) || '';
    if (cached) {
      const timer = window.setTimeout(() => {
        fetchOverview(cached);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!authorized || !password) return;
    const timer = window.setInterval(() => {
      fetchOverview(password);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [authorized, password]);

  const envRows = useMemo(() => {
    if (!payload) return [];
    return [
      { key: 'Zhipu', value: payload.envStatus.zhipu },
      { key: 'Moonshot', value: payload.envStatus.moonshot },
      { key: 'DeepSeek', value: payload.envStatus.deepseek },
      { key: 'Doubao', value: payload.envStatus.doubao },
      { key: 'DashScope', value: payload.envStatus.dashscope },
      { key: 'MCP Search', value: payload.envStatus.mcpSearch },
    ];
  }, [payload]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
            <p className="mt-1 text-sm text-gray-500">用于查看运行状态、接口可用性与最近请求记录</p>
          </div>
          <Link href="/" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            返回首页
          </Link>
        </div>

        {!authorized ? (
          <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-gray-800">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              <span className="font-semibold">管理员登录</span>
            </div>
            <label className="mb-2 block text-sm font-medium text-gray-700">管理密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="请输入管理密码"
            />
            {error ? (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4" />
                <span>{error}</span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => fetchOverview(password)}
              disabled={loading || !password.trim()}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '登录中...' : '登录后台'}
            </button>
            <p className="mt-3 text-xs text-gray-500">可通过环境变量 ADMIN_PASSWORD 修改后台密码。</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">总请求数</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{payload?.overview.totalRequests ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">总访问量（PV）</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{payload?.overview.traffic.totalVisits ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">今日访问量</div>
                <div className="mt-2 text-3xl font-bold text-indigo-600">{payload?.overview.traffic.todayVisits ?? 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">独立访客估算（UV）</div>
                <div className="mt-2 text-3xl font-bold text-emerald-600">{payload?.overview.traffic.uniqueVisitors ?? 0}</div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-gray-800">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  <span className="font-semibold">接口统计</span>
                </div>
                <div className="space-y-2 text-sm text-gray-700">
                  <div>生成接口：总 {payload?.overview.generate.total ?? 0}，成功 {payload?.overview.generate.success ?? 0}，失败 {payload?.overview.generate.error ?? 0}</div>
                  <div>下载接口：总 {payload?.overview.download.total ?? 0}，成功 {payload?.overview.download.success ?? 0}，失败 {payload?.overview.download.error ?? 0}</div>
                  <div>生成成功率：{payload?.overview.generate.successRate ?? 0}%</div>
                  <div>下载成功率：{payload?.overview.download.successRate ?? 0}%</div>
                  <div>服务启动时间：{formatDateTime(payload?.overview.startedAt || '')}</div>
                  <div>服务器当前时间：{formatDateTime(payload?.now || '')}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-gray-800">
                  <KeyRound className="h-5 w-5 text-indigo-600" />
                  <span className="font-semibold">环境变量状态</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envRows.map((item) => (
                    <span
                      key={item.key}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColor(item.value)}`}
                    >
                      {item.key}：{item.value ? '已配置' : '未配置'}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-gray-800">
                <Activity className="h-5 w-5 text-indigo-600" />
                <span className="font-semibold">访问量趋势（近7天）</span>
              </div>
              <div className="mb-3 text-sm text-gray-600">
                今日访问量 {payload?.overview.traffic.todayVisits ?? 0}，今日独立访客估算 {payload?.overview.traffic.todayUniqueVisitors ?? 0}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-2 py-2">日期</th>
                      <th className="px-2 py-2">访问量(PV)</th>
                      <th className="px-2 py-2">独立访客估算(UV)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload?.overview.traffic.last7Days || []).map((item) => (
                      <tr key={item.date} className="border-b border-gray-100 text-gray-700">
                        <td className="px-2 py-2 whitespace-nowrap">{item.date}</td>
                        <td className="px-2 py-2">{item.visits}</td>
                        <td className="px-2 py-2">{item.uniqueVisitors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-800">
                  <RefreshCw className="h-5 w-5 text-indigo-600" />
                  <span className="font-semibold">最近请求记录</span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchOverview(password)}
                  disabled={loading}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? '刷新中...' : '手动刷新'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-2 py-2">时间</th>
                      <th className="px-2 py-2">类型</th>
                      <th className="px-2 py-2">状态</th>
                      <th className="px-2 py-2">模型</th>
                      <th className="px-2 py-2">附加信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload?.overview.recentEvents || []).map((event) => (
                      <tr key={event.id} className="border-b border-gray-100 text-gray-700">
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                        <td className="px-2 py-2">{event.type}</td>
                        <td className="px-2 py-2">
                          <span className={event.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}>
                            {event.status}
                          </span>
                        </td>
                        <td className="px-2 py-2">{event.model || '-'}</td>
                        <td className="px-2 py-2">
                          {event.status === 'error'
                            ? event.errorMessage || '-'
                            : `图片:${event.hasImages ? '是' : '否'} / Prompt:${event.promptLength ?? '-'} / Markdown:${event.markdownLength ?? '-'}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
