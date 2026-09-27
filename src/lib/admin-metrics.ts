import { getAdminAggregates, getAdminStartedAt, getRecentAdminEvents, insertAdminEvent, insertAdminVisit } from '@/lib/admin-db';

type AdminEventType = 'generate' | 'download';

type AdminEvent = {
  id: string;
  type: AdminEventType;
  status: 'success' | 'error';
  model?: string;
  hasImages?: boolean;
  promptLength?: number;
  markdownLength?: number;
  errorMessage?: string;
  createdAt: string;
};

export async function trackAdminEvent(input: Omit<AdminEvent, 'id' | 'createdAt'>) {
  await insertAdminEvent(input);
}

export async function trackAdminVisit(input: { visitorKey: string; dateKey?: string }) {
  await insertAdminVisit(input);
}

export async function getAdminOverview() {
  const aggregates = await getAdminAggregates();
  const trafficByDate = new Map(aggregates.last7Days.map((item) => [item.date, item]));
  const requestsByDate = new Map(aggregates.last7RequestDays.map((item) => [item.date, item]));
  const last7DateKeys = Array.from({ length: 7 }, (_, index) =>
    new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const last7Days = last7DateKeys.map((date) => ({
    date,
    visits: trafficByDate.get(date)?.visits || 0,
    uniqueVisitors: trafficByDate.get(date)?.uniqueVisitors || 0,
  }));
  const last7RequestDays = last7DateKeys.map((date) => ({
    date,
    generate: requestsByDate.get(date)?.generate || 0,
    download: requestsByDate.get(date)?.download || 0,
  }));
  const totalRequests = aggregates.generateTotal + aggregates.downloadTotal;
  const recentEvents = (await getRecentAdminEvents(80)).map((item) => ({
    ...item,
    hasImages: Boolean(item.hasImages),
  }));
  return {
    startedAt: await getAdminStartedAt(),
    totalRequests,
    generate: {
      total: aggregates.generateTotal,
      success: aggregates.generateSuccess,
      error: aggregates.generateError,
      successRate: aggregates.generateTotal > 0 ? Number(((aggregates.generateSuccess / aggregates.generateTotal) * 100).toFixed(1)) : 0,
    },
    download: {
      total: aggregates.downloadTotal,
      success: aggregates.downloadSuccess,
      error: aggregates.downloadError,
      successRate: aggregates.downloadTotal > 0 ? Number(((aggregates.downloadSuccess / aggregates.downloadTotal) * 100).toFixed(1)) : 0,
    },
    traffic: {
      totalVisits: aggregates.totalVisits,
      uniqueVisitors: aggregates.uniqueVisitors,
      todayVisits: aggregates.todayVisits,
      todayUniqueVisitors: aggregates.todayUniqueVisitors,
      last7Days,
    },
    requestsByDay: last7RequestDays,
    recentEvents,
  };
}
