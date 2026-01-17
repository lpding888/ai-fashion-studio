import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StyleAgent } from '../mcp/style-agent';
import { Prisma } from '../../generated/prisma/client';

type OverviewArgs = {
  days: number;
  topN: number;
  sampleN: number;
};

type DayBucketRow = { day: Date; count: bigint };
type DayStatusBucketRow = { day: Date; status: string; count: bigint };
type DayTypeBucketRow = { day: Date; type: string; count: bigint; sum: bigint };
type KeyCountRow = { key: string; count: bigint };

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly styleAgent: StyleAgent,
  ) {}

  async getOverview(args: OverviewArgs) {
    const now = Date.now();
    const start = new Date(now - args.days * 24 * 60 * 60 * 1000);
    const start24h = new Date(now - 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersByStatus,
      usersByRole,
      usersCreatedLast24h,
      usersCreatedWindow,
      creditsTotalBalanceAgg,
      tasksTotal,
      tasksByStatus,
      tasksCreatedLast24h,
      tasksCreatedWindow,
      creditsTxWindow,
      creditsTx24h,
      facePresetCount,
      stylePresetCount,
      stylePresetsData,
      tasksSampleWindow,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: start24h } } }),
      this.prisma.user.count({ where: { createdAt: { gte: start } } }),
      this.prisma.user.aggregate({ _sum: { credits: true } }),
      this.prisma.task.count(),
      this.prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.task.count({ where: { createdAt: { gte: start24h } } }),
      this.prisma.task.count({ where: { createdAt: { gte: start } } }),
      this.prisma.creditTransaction.groupBy({
        by: ['type'],
        where: { createdAt: { gte: start } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.creditTransaction.groupBy({
        by: ['type'],
        where: { createdAt: { gte: start24h } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.facePreset.count(),
      this.prisma.stylePreset.count(),
      this.prisma.stylePreset.findMany({ select: { data: true } }),
      this.prisma.task.findMany({
        where: { createdAt: { gte: start } },
        orderBy: { createdAt: 'desc' },
        take: args.sampleN,
        select: { createdAt: true, data: true, creditsSpent: true, status: true },
      }),
    ]);

    const [
      topTaskUsersWindow,
      topSpendersWindow,
      failureReasonsTop,
      tasksByDayStatus,
      usersByDay,
      creditsByDayType,
      distPainterModel,
      distResolution,
      distAspectRatio,
      distWorkflow,
      distIncludeThoughts,
    ] = await Promise.all([
      this.prisma.$queryRaw<Array<{ userId: string; count: bigint }>>(Prisma.sql`
        SELECT user_id as "userId", COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start} AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY "count" DESC
        LIMIT ${args.topN}
      `),
      this.prisma.$queryRaw<Array<{ userId: string; spent: bigint }>>(Prisma.sql`
        SELECT user_id as "userId", COALESCE(SUM(amount), 0)::bigint as "spent"
        FROM credit_transactions
        WHERE created_at >= ${start} AND type = 'SPEND'
        GROUP BY user_id
        ORDER BY "spent" DESC
        LIMIT ${args.topN}
      `),
      this.prisma.$queryRaw<Array<{ error: string; count: bigint }>>(Prisma.sql`
        SELECT
          COALESCE(NULLIF((data->>'error'), ''), '(empty)') as "error",
          COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start} AND status = 'FAILED'
        GROUP BY "error"
        ORDER BY "count" DESC
        LIMIT ${args.topN}
      `),
      this.prisma.$queryRaw<DayStatusBucketRow[]>(Prisma.sql`
        SELECT date_trunc('day', created_at) as "day", status as "status", COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start}
        GROUP BY "day", "status"
        ORDER BY "day" ASC
      `),
      this.prisma.$queryRaw<DayBucketRow[]>(Prisma.sql`
        SELECT date_trunc('day', created_at) as "day", COUNT(*)::bigint as "count"
        FROM users
        WHERE created_at >= ${start}
        GROUP BY "day"
        ORDER BY "day" ASC
      `),
      this.prisma.$queryRaw<DayTypeBucketRow[]>(Prisma.sql`
        SELECT date_trunc('day', created_at) as "day", type as "type", COUNT(*)::bigint as "count", COALESCE(SUM(amount),0)::bigint as "sum"
        FROM credit_transactions
        WHERE created_at >= ${start}
        GROUP BY "day", "type"
        ORDER BY "day" ASC
      `),
      this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
        SELECT
          COALESCE(NULLIF((data->'config'->>'painterModel'), ''), '(unknown)') as "key",
          COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start}
        GROUP BY "key"
        ORDER BY "count" DESC
        LIMIT ${args.topN}
      `),
      this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
        SELECT
          COALESCE(NULLIF((data->>'resolution'), ''), '(unknown)') as "key",
          COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start}
        GROUP BY "key"
        ORDER BY "count" DESC
      `),
      this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
        SELECT
          COALESCE(NULLIF((data->>'aspectRatio'), ''), '(unknown)') as "key",
          COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start}
        GROUP BY "key"
        ORDER BY "count" DESC
      `),
      this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
        SELECT
          COALESCE(NULLIF((data->>'workflow'), ''), 'legacy') as "key",
          COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start}
        GROUP BY "key"
        ORDER BY "count" DESC
      `),
      this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
        SELECT
          COALESCE(NULLIF((data->>'directIncludeThoughts'), ''), '(unset)') as "key",
          COUNT(*)::bigint as "count"
        FROM tasks
        WHERE created_at >= ${start}
        GROUP BY "key"
        ORDER BY "count" DESC
      `),
    ]);

    const styleKindCounts: Record<string, number> = {};
    for (const row of stylePresetsData) {
      const kind = String((row.data as any)?.kind || 'STYLE').toUpperCase();
      styleKindCounts[kind] = (styleKindCounts[kind] || 0) + 1;
    }

    const txToMap = (
      rows: Array<{ type: 'EARN' | 'SPEND'; _sum: { amount: number | null }; _count: { _all: number } }>,
    ) => {
      const out: Record<string, { count: number; sum: number }> = {};
      for (const r of rows) {
        out[r.type] = { count: r._count._all, sum: r._sum.amount ?? 0 };
      }
      return out;
    };

    const statusToMap = (rows: Array<{ status: string; _count: { _all: number } }>) => {
      const out: Record<string, number> = {};
      for (const r of rows) out[r.status] = r._count._all;
      return out;
    };

    const usersStatusMap = usersByStatus.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = r._count._all;
      return acc;
    }, {});

    const usersRoleMap = usersByRole.reduce<Record<string, number>>((acc, r) => {
      acc[r.role] = r._count._all;
      return acc;
    }, {});

    const tasksStatusMap = statusToMap(tasksByStatus as any);

    const avgCreditsSpentWindow = (() => {
      const rows = tasksSampleWindow.filter((t) => typeof t.creditsSpent === 'number') as Array<{ creditsSpent: number }>;
      if (rows.length === 0) return null;
      const sum = rows.reduce((s, r) => s + r.creditsSpent, 0);
      return sum / rows.length;
    })();

    const durationMsStats = (() => {
      const durations: number[] = [];
      for (const t of tasksSampleWindow) {
        try {
          const createdAt = new Date(t.createdAt).getTime();
          const data = t.data as any;
          const shots = Array.isArray(data?.shots) ? data.shots : [];
          let earliest: number | undefined;
          for (const shot of shots) {
            const versions = Array.isArray(shot?.versions) ? shot.versions : [];
            for (const v of versions) {
              const ts = typeof v?.createdAt === 'number' ? v.createdAt : undefined;
              if (!ts) continue;
              earliest = earliest === undefined ? ts : Math.min(earliest, ts);
            }
          }
          if (earliest !== undefined) {
            const d = earliest - createdAt;
            if (Number.isFinite(d) && d >= 0) durations.push(d);
          }
        } catch {
          // ignore bad rows
        }
      }
      if (durations.length === 0) return { sample: 0, avgMs: null, p50Ms: null, p90Ms: null };
      durations.sort((a, b) => a - b);
      const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
      const p50 = durations[Math.floor(durations.length * 0.5)];
      const p90 = durations[Math.floor(durations.length * 0.9)];
      return { sample: durations.length, avgMs: avg, p50Ms: p50, p90Ms: p90 };
    })();

    const normalizeDay = (d: Date) => {
      // Keep it stable across envs: use local date string.
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const daily = (() => {
      const startDay = new Date(start);
      startDay.setHours(0, 0, 0, 0);
      const endDay = new Date(now);
      endDay.setHours(0, 0, 0, 0);

      const days: string[] = [];
      for (let t = startDay.getTime(); t <= endDay.getTime(); t += 24 * 60 * 60 * 1000) {
        days.push(normalizeDay(new Date(t)));
      }

      const usersMap = new Map(usersByDay.map((r) => [normalizeDay(new Date(r.day)), Number(r.count || 0)]));
      const tasksCreatedMap = new Map<string, number>();
      const tasksFailedMap = new Map<string, number>();
      const tasksCompletedMap = new Map<string, number>();
      for (const r of tasksByDayStatus) {
        const day = normalizeDay(new Date(r.day));
        const c = Number(r.count || 0);
        tasksCreatedMap.set(day, (tasksCreatedMap.get(day) || 0) + c);
        if (r.status === 'FAILED') tasksFailedMap.set(day, (tasksFailedMap.get(day) || 0) + c);
        if (r.status === 'COMPLETED') tasksCompletedMap.set(day, (tasksCompletedMap.get(day) || 0) + c);
      }

      const creditsEarnMap = new Map<string, number>();
      const creditsSpendMap = new Map<string, number>();
      for (const r of creditsByDayType) {
        const day = normalizeDay(new Date(r.day));
        const sum = Number(r.sum || 0);
        if (r.type === 'EARN') creditsEarnMap.set(day, sum);
        if (r.type === 'SPEND') creditsSpendMap.set(day, sum);
      }

      return days.map((day) => ({
        day,
        usersCreated: usersMap.get(day) || 0,
        tasksCreated: tasksCreatedMap.get(day) || 0,
        tasksFailed: tasksFailedMap.get(day) || 0,
        tasksCompleted: tasksCompletedMap.get(day) || 0,
        creditsEarned: creditsEarnMap.get(day) || 0,
        creditsSpent: creditsSpendMap.get(day) || 0,
      }));
    })();

    return {
      success: true,
      generatedAt: now,
      window: {
        days: args.days,
        startTs: start.getTime(),
        start24hTs: start24h.getTime(),
      },
      trends: {
        daily,
      },
      users: {
        total: usersTotal,
        byStatus: usersStatusMap,
        byRole: usersRoleMap,
        createdLast24h: usersCreatedLast24h,
        createdWindow: usersCreatedWindow,
      },
      tasks: {
        total: tasksTotal,
        byStatus: tasksStatusMap,
        createdLast24h: tasksCreatedLast24h,
        createdWindow: tasksCreatedWindow,
        avgCreditsSpentWindow,
        durationMsWindow: durationMsStats,
        topUsersByTaskCountWindow: topTaskUsersWindow.map((r) => ({
          userId: r.userId,
          count: Number(r.count || 0),
        })),
        failureReasonsTop: failureReasonsTop.map((r) => ({
          error: r.error,
          count: Number(r.count || 0),
        })),
      },
      credits: {
        totalBalance: creditsTotalBalanceAgg._sum.credits ?? 0,
        txLast24h: txToMap(creditsTx24h as any),
        txWindow: txToMap(creditsTxWindow as any),
        topSpendersWindow: topSpendersWindow.map((r) => ({
          userId: r.userId,
          spent: Number(r.spent || 0),
        })),
      },
      distributions: {
        painterModel: distPainterModel.map((r) => ({ key: r.key, count: Number(r.count || 0) })),
        resolution: distResolution.map((r) => ({ key: r.key, count: Number(r.count || 0) })),
        aspectRatio: distAspectRatio.map((r) => ({ key: r.key, count: Number(r.count || 0) })),
        workflow: distWorkflow.map((r) => ({ key: r.key, count: Number(r.count || 0) })),
        includeThoughts: distIncludeThoughts.map((r) => ({ key: r.key, count: Number(r.count || 0) })),
      },
      presets: {
        facePresets: facePresetCount,
        stylePresets: stylePresetCount,
        stylePresetsByKind: styleKindCounts,
      },
      mcp: this.styleAgent.getStatus(),
    };
  }
}
