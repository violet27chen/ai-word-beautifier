'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, KeyRound, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

type EnvStatus = {
  deepseek: boolean;
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

type TrafficDay = { date: string; visits: number; uniqueVisitors: number };
type RequestDay = { date: string; generate: number; download: number };
type PieDatum = { label: string; value: number; color: string };

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
      last7Days: TrafficDay[];
    };
    requestsByDay: RequestDay[];
    requestInsights: {
      total: number;
      success: number;
      errors: number;
      generateWithImages: number;
      generateTextOnly: number;
      hourlyRequests: Array<{ hour: number; requests: number }>;
    };
    recentEvents: AdminEvent[];
  };
};

function statusColor(value: boolean) {
  return value ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200';
}

function formatDateTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')} ${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}:${`${d.getSeconds()}`.padStart(2, '0')}`;
}

function formatChartDate(date: string) {
  return date.slice(5);
}

function TrafficTrendChart({ days }: { days: TrafficDay[] }) {
  const width = 360;
  const top = 20;
  const bottom = 160;
  const maxValue = Math.max(1, ...days.flatMap((day) => [day.visits, day.uniqueVisitors]));
  const x = (index: number) => 48 + index * (288 / Math.max(1, days.length - 1));
  const y = (value: number) => bottom - (value / maxValue) * (bottom - top);
  const visitsLine = days.map((day, index) => `${x(index)},${y(day.visits)}`).join(' ');
  const uniqueLine = days.map((day, index) => `${x(index)},${y(day.uniqueVisitors)}`).join(' ');

  return (
    <div>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} 205`} role="img" aria-label="近七天访问量和独立访客趋势图">
        <title>近七天访问趋势</title>
        <desc>折线分别显示每日页面访问量 PV 与独立访客估算 UV。</desc>
        {[0, 0.5, 1].map((ratio) => {
          const gridY = bottom - ratio * (bottom - top);
          return (
            <g key={ratio}>
              <line x1="42" x2="350" y1={gridY} y2={gridY} stroke="#e5e7eb" strokeWidth="1" />
              <text x="36" y={gridY + 4} textAnchor="end" fill="#6b7280" fontSize="11">
                {Math.round(maxValue * ratio)}
              </text>
            </g>
          );
        })}
        <polyline points={visitsLine} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={uniqueLine} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {days.map((day, index) => (
          <g key={day.date}>
            <circle cx={x(index)} cy={y(day.visits)} r="3.5" fill="#4f46e5">
              <title>{`${day.date} PV ${day.visits}`}</title>
            </circle>
            <circle cx={x(index)} cy={y(day.uniqueVisitors)} r="3.5" fill="#059669">
              <title>{`${day.date} UV ${day.uniqueVisitors}`}</title>
            </circle>
            <text x={x(index)} y="184" textAnchor="middle" fill="#6b7280" fontSize="11">{formatChartDate(day.date)}</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-xs text-gray-600">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-indigo-600" />PV 页面访问</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />UV 独立访客估算</span>
      </div>
    </div>
  );
}

function RequestTrendChart({ days }: { days: RequestDay[] }) {
  const width = 360;
  const top = 20;
  const bottom = 160;
  const maxValue = Math.max(1, ...days.map((day) => day.generate + day.download));
  const x = (index: number) => 48 + index * (288 / Math.max(1, days.length - 1));
  const height = (value: number) => (value / maxValue) * (bottom - top);

  return (
    <div>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} 205`} role="img" aria-label="近七天生成和下载接口调用量柱状图">
        <title>近七天接口调用趋势</title>
        <desc>分组柱状图比较每天的文档生成与下载请求次数。</desc>
        {[0, 0.5, 1].map((ratio) => {
          const gridY = bottom - ratio * (bottom - top);
          return (
            <g key={ratio}>
              <line x1="42" x2="350" y1={gridY} y2={gridY} stroke="#e5e7eb" strokeWidth="1" />
              <text x="36" y={gridY + 4} textAnchor="end" fill="#6b7280" fontSize="11">{Math.round(maxValue * ratio)}</text>
            </g>
          );
        })}
        {days.map((day, index) => (
          <g key={day.date}>
            <rect x={x(index) - 10} y={bottom - height(day.generate)} width="12" height={height(day.generate)} rx="2" fill="#4f46e5">
              <title>{`${day.date} 生成 ${day.generate} 次`}</title>
            </rect>
            <rect x={x(index) + 3} y={bottom - height(day.download)} width="12" height={height(day.download)} rx="2" fill="#0ea5e9">
              <title>{`${day.date} 下载 ${day.download} 次`}</title>
            </rect>
            <text x={x(index)} y="184" textAnchor="middle" fill="#6b7280" fontSize="11">{formatChartDate(day.date)}</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-xs text-gray-600">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-600" />文档生成</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-sky-500" />文档下载</span>
      </div>
    </div>
  );
}

function RequestOutcomeBar({ label, total, success, errors }: { label: string; total: number; success: number; errors: number }) {
  const successWidth = total ? (success / total) * 100 : 0;
  const errorWidth = total ? (errors / total) * 100 : 0;
  const successRate = total ? ((success / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-gray-600">{total} 次 · 成功率 {successRate}%</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${label}成功 ${success} 次，失败 ${errors} 次`}>
        <div className="bg-emerald-500" style={{ width: `${successWidth}%` }} />
        <div className="bg-rose-500" style={{ width: `${errorWidth}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>成功 {success}</span>
        <span>失败 {errors}</span>
      </div>
    </div>
  );
}

function pieSlicePath(startAngle: number, endAngle: number) {
  const radius = 76;
  const center = 90;
  const start = (startAngle * Math.PI) / 180;
  const end = (endAngle * Math.PI) / 180;
  const startX = center + radius * Math.cos(start);
  const startY = center + radius * Math.sin(start);
  const endX = center + radius * Math.cos(end);
  const endY = center + radius * Math.sin(end);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}

function PieChart({ title, data }: { title: string; data: PieDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const nonZeroData = data.filter((item) => item.value > 0);
  const slices = nonZeroData.map((item, index) => {
    const previousValue = nonZeroData.slice(0, index).reduce((sum, current) => sum + current.value, 0);
    const startAngle = -90 + (previousValue / total) * 360;
    return {
      ...item,
      startAngle,
      endAngle: startAngle + (item.value / total) * 360,
    };
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <svg className="h-40 w-40 shrink-0" viewBox="0 0 180 180" role="img" aria-label={`${title}饼图，总计 ${total} 次`}>
        <title>{title}饼图</title>
        <desc>{data.map((item) => `${item.label} ${item.value} 次`).join('；')}</desc>
        {total === 0 ? (
          <circle cx="90" cy="90" r="76" fill="#e5e7eb" />
        ) : slices.length === 1 ? (
          <circle cx="90" cy="90" r="76" fill={slices[0].color}>
            <title>{`${slices[0].label}: ${slices[0].value}`}</title>
          </circle>
        ) : slices.map((slice) => (
          <path key={slice.label} d={pieSlicePath(slice.startAngle, slice.endAngle)} fill={slice.color}>
            <title>{`${slice.label}: ${slice.value} (${((slice.value / total) * 100).toFixed(1)}%)`}</title>
          </path>
        ))}
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {data.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-gray-600">
              <i className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-gray-900">
              {item.value} <span className="font-normal text-gray-500">{total ? `${((item.value / total) * 100).toFixed(1)}%` : '0%'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HourlyActivityChart({ data }: { data: Array<{ hour: number; requests: number }> }) {
  const top = 16;
  const bottom = 142;
  const maxRequests = Math.max(1, ...data.map((item) => item.requests));
  const barWidth = 8;
  const x = (hour: number) => 31 + hour * 12.5;
  const height = (requests: number) => (requests / maxRequests) * (bottom - top);

  return (
    <svg className="h-auto w-full" viewBox="0 0 360 182" role="img" aria-label="近30天按 UTC 小时汇总的接口请求量">
      <title>近30天小时活跃度</title>
      <desc>柱形表示每天对应 UTC 小时的生成和下载请求总数。</desc>
      {[0, 0.5, 1].map((ratio) => {
        const gridY = bottom - ratio * (bottom - top);
        return (
          <g key={ratio}>
            <line x1="26" x2="340" y1={gridY} y2={gridY} stroke="#e5e7eb" strokeWidth="1" />
            <text x="22" y={gridY + 4} textAnchor="end" fill="#6b7280" fontSize="11">{Math.round(maxRequests * ratio)}</text>
          </g>
        );
      })}
      {data.map((item) => (
        <g key={item.hour}>
          <rect x={x(item.hour)} y={bottom - height(item.requests)} width={barWidth} height={height(item.requests)} rx="2" fill="#6366f1">
            <title>{`${String(item.hour).padStart(2, '0')}:00 UTC · ${item.requests} 次请求`}</title>
          </rect>
          {item.hour % 3 === 0 ? (
            <text x={x(item.hour) + barWidth / 2} y="164" textAnchor="middle" fill="#6b7280" fontSize="11">
              {String(item.hour).padStart(2, '0')}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
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
    if (!authorized || !password) return;
    const timer = window.setInterval(() => {
      fetchOverview(password);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [authorized, password]);

  const envRows = useMemo(() => {
    if (!payload) return [];
    return [
      { key: 'DeepSeek', value: payload.envStatus.deepseek },
      { key: 'MCP Search', value: payload.envStatus.mcpSearch },
    ];
  }, [payload]);

  const trendRows = useMemo(() => {
    if (!payload) return [];
    const requestsByDate = new Map(payload.overview.requestsByDay.map((item) => [item.date, item]));
    return payload.overview.traffic.last7Days.map((item) => {
      const requests = requestsByDate.get(item.date);
      return { ...item, generate: requests?.generate || 0, download: requests?.download || 0 };
    });
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

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="traffic-chart-title">
                <div className="mb-2 flex items-center gap-2 text-gray-800">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  <h2 id="traffic-chart-title" className="font-semibold">访问趋势（近7天）</h2>
                </div>
                <p className="mb-2 text-xs text-gray-500">今日 PV {payload?.overview.traffic.todayVisits ?? 0} · UV 估算 {payload?.overview.traffic.todayUniqueVisitors ?? 0}</p>
                <TrafficTrendChart days={trendRows} />
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="request-chart-title">
                <div className="mb-2 flex items-center gap-2 text-gray-800">
                  <Activity className="h-5 w-5 text-sky-600" />
                  <h2 id="request-chart-title" className="font-semibold">接口调用趋势（近7天）</h2>
                </div>
                <p className="mb-2 text-xs text-gray-500">按日比较文档生成与下载接口请求次数</p>
                <RequestTrendChart days={trendRows} />
              </section>
            </div>

            <section aria-label="业务结构分析">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">业务结构分析</h2>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 font-semibold text-gray-800">请求类型占比</h3>
                  <PieChart title="请求类型占比" data={[
                    { label: '文档生成', value: payload?.overview.generate.total ?? 0, color: '#4f46e5' },
                    { label: '文档下载', value: payload?.overview.download.total ?? 0, color: '#0ea5e9' },
                  ]} />
                </article>
                <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 font-semibold text-gray-800">请求结果占比</h3>
                  <PieChart title="成功与失败请求占比" data={[
                    { label: '成功', value: payload?.overview.requestInsights.success ?? 0, color: '#059669' },
                    { label: '失败', value: payload?.overview.requestInsights.errors ?? 0, color: '#e11d48' },
                  ]} />
                </article>
                <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 font-semibold text-gray-800">生成输入方式占比</h3>
                  <PieChart title="带图片与纯文本生成请求占比" data={[
                    { label: '图片输入', value: payload?.overview.requestInsights.generateWithImages ?? 0, color: '#f59e0b' },
                    { label: '纯文本', value: payload?.overview.requestInsights.generateTextOnly ?? 0, color: '#6366f1' },
                  ]} />
                </article>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="hourly-chart-title">
              <div className="mb-2 flex items-center gap-2 text-gray-800">
                <Activity className="h-5 w-5 text-violet-600" />
                <h2 id="hourly-chart-title" className="font-semibold">小时活跃度（近30天）</h2>
              </div>
              <p className="mb-2 text-xs text-gray-500">按 UTC 小时统计生成与下载请求，用于观察一天内的使用时段分布</p>
              <HourlyActivityChart data={payload?.overview.requestInsights.hourlyRequests ?? []} />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="request-outcome-title">
                <div className="mb-5 flex items-center gap-2 text-gray-800">
                  <Activity className="h-5 w-5 text-emerald-600" />
                  <h2 id="request-outcome-title" className="font-semibold">接口成功率与结果分布</h2>
                </div>
                <div className="mb-4 flex gap-4 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />成功</span>
                  <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />失败</span>
                </div>
                <div className="space-y-6">
                  <RequestOutcomeBar label="文档生成" total={payload?.overview.generate.total ?? 0} success={payload?.overview.generate.success ?? 0} errors={payload?.overview.generate.error ?? 0} />
                  <RequestOutcomeBar label="文档下载" total={payload?.overview.download.total ?? 0} success={payload?.overview.download.success ?? 0} errors={payload?.overview.download.error ?? 0} />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="daily-data-title">
                <div className="mb-4 flex items-center gap-2 text-gray-800">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  <h2 id="daily-data-title" className="font-semibold">近7日分析数据</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[620px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="px-2 py-2">日期（UTC）</th>
                        <th className="px-2 py-2 text-right">PV</th>
                        <th className="px-2 py-2 text-right">UV</th>
                        <th className="px-2 py-2 text-right">生成</th>
                        <th className="px-2 py-2 text-right">下载</th>
                        <th className="px-2 py-2 text-right">请求合计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trendRows.map((item) => (
                        <tr key={item.date} className="border-b border-gray-100 text-gray-700">
                          <td className="px-2 py-2 whitespace-nowrap">{item.date}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{item.visits}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{item.uniqueVisitors}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{item.generate}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{item.download}</td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums">{item.generate + item.download}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-gray-500">PV 为页面访问次数；UV 按 IP 与 UA 估算；时间按 UTC 日期统计。</p>
              </section>
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
