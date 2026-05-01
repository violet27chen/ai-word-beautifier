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

export function trackAdminEvent(input: Omit<AdminEvent, 'id' | 'createdAt'>) {
  insertAdminEvent(input);
}

export function trackAdminVisit(input: { visitorKey: string; dateKey?: string }) {
  insertAdminVisit(input);
}

export function getAdminOverview() {
  const aggregates = getAdminAggregates();
  const totalRequests = aggregates.generateTotal + aggregates.downloadTotal;
  const recentEvents = getRecentAdminEvents(80).map((item) => ({
    ...item,
    hasImages: Boolean(item.hasImages),
  }));
  return {
    startedAt: getAdminStartedAt(),
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
      last7Days: aggregates.last7Days,
    },
    recentEvents,
  };
}
