'use client';

import { useEffect, useMemo, useState } from 'react';
import { BACKEND_ORIGIN } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Overview = {
  generatedAt: number;
  window: { days: number; startTs: number; start24hTs: number };
  trends: {
    daily: Array<{
      day: string;
      usersCreated: number;
      tasksCreated: number;
      tasksFailed: number;
      tasksCompleted: number;
      creditsEarned: number;
      creditsSpent: number;
    }>;
  };
  users: {
    total: number;
    byStatus: Record<string, number>;
    byRole: Record<string, number>;
    createdLast24h: number;
    createdWindow: number;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    createdLast24h: number;
    createdWindow: number;
    avgCreditsSpentWindow: number | null;
    durationMsWindow: { sample: number; avgMs: number | null; p50Ms: number | null; p90Ms: number | null };
    topUsersByTaskCountWindow: Array<{ userId: string; count: number }>;
    failureReasonsTop: Array<{ error: string; count: number }>;
  };
  credits: {
    totalBalance: number;
    txLast24h: Record<string, { count: number; sum: number }>;
    txWindow: Record<string, { count: number; sum: number }>;
    topSpendersWindow: Array<{ userId: string; spent: number }>;
  };
  distributions: {
    painterModel: Array<{ key: string; count: number }>;
    resolution: Array<{ key: string; count: number }>;
    aspectRatio: Array<{ key: string; count: number }>;
    workflow: Array<{ key: string; count: number }>;
    includeThoughts: Array<{ key: string; count: number }>;
  };
  presets: {
    facePresets: number;
    stylePresets: number;
    stylePresetsByKind: Record<string, number>;
  };
  mcp: {
    tools: string[];
    toolCallCounts: Record<string, number>;
    lastToolCallAt?: number;
    lastConnectedAt?: number;
    hasActiveTransport: boolean;
  };
};

function fmtInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '-';
}

function fmtMs(ms: number | null) {
  if (ms === null) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r}s`;
}

function SparkLines({
  series,
  height = 96,
}: {
  series: Array<{ name: string; color: string; data: number[] }>;
  height?: number;
}) {
  const w = 600;
  const h = 120;
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.data).map((v) => (Number.isFinite(v) ? v : 0)),
  );
  const len = Math.max(0, ...series.map((s) => s.data.length));
  const pad = 6;

  const toPoints = (arr: number[]) => {
    if (len <= 1) return '';
    return arr
      .map((v, idx) => {
        const x = pad + (idx * (w - pad * 2)) / (len - 1);
        const y = h - pad - ((Number(v) || 0) * (h - pad * 2)) / max;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }}>
        <polyline
          points={`${pad},${h - pad} ${w - pad},${h - pad}`}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="1"
        />
        {series.map((s) => (
          <polyline
            key={s.name}
            points={toPoints(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState('7');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);

  const fetchOverview = async (nextDays: string) => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const url = new URL(`${BACKEND_ORIGIN}/api/admin/analytics/overview`);
      url.searchParams.set('days', nextDays);
      url.searchParams.set('topN', '10');
      url.searchParams.set('sampleN', '200');
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      setData(json as Overview);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview(days);
  }, [days]);

  const taskStatusRows = useMemo(() => {
    const m = data?.tasks?.byStatus || {};
    return Object.entries(m)
      .map(([status, count]) => ({ status, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const txRows = useMemo(() => {
    const m = data?.credits?.txWindow || {};
    return Object.entries(m)
      .map(([type, v]) => ({ type, count: Number(v?.count || 0), sum: Number(v?.sum || 0) }))
      .sort((a, b) => b.sum - a.sum);
  }, [data]);

  const mcpToolRows = useMemo(() => {
    const tools = data?.mcp?.tools || [];
    const counts = data?.mcp?.toolCallCounts || {};
    return tools
      .map((t) => ({ name: t, count: Number(counts[t] || 0) }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const avgCreditsSpentWindow = data?.tasks?.avgCreditsSpentWindow;
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-CN') : '-';

  const trend = data?.trends?.daily || [];
  const trendDays = trend.map((r) => r.day);
  const trendTasksCreated = trend.map((r) => r.tasksCreated);
  const trendTasksFailed = trend.map((r) => r.tasksFailed);
  const trendCreditsSpent = trend.map((r) => r.creditsSpent);
  const trendCreditsEarned = trend.map((r) => r.creditsEarned);
  const trendUsersCreated = trend.map((r) => r.usersCreated);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">数据分析</h2>
          <p className="text-muted-foreground">尽可能多的系统统计（窗口：最近 N 天；生成时间：{generatedAt}）</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="选择窗口" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">最近 1 天</SelectItem>
              <SelectItem value="7">最近 7 天</SelectItem>
              <SelectItem value="30">最近 30 天</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void fetchOverview(days)} disabled={loading}>
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>加载失败</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>用户</CardTitle>
            <CardDescription>总量 / 新增</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{fmtInt(data?.users?.total)}</div>
            <div className="text-sm text-muted-foreground">
              最近 24h 新增：<span className="font-mono text-foreground">{fmtInt(data?.users?.createdLast24h)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              窗口新增：<span className="font-mono text-foreground">{fmtInt(data?.users?.createdWindow)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>任务</CardTitle>
            <CardDescription>总量 / 新增</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{fmtInt(data?.tasks?.total)}</div>
            <div className="text-sm text-muted-foreground">
              最近 24h 新增：<span className="font-mono text-foreground">{fmtInt(data?.tasks?.createdLast24h)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              窗口新增：<span className="font-mono text-foreground">{fmtInt(data?.tasks?.createdWindow)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>积分</CardTitle>
            <CardDescription>总余额 / 窗口流水</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{fmtInt(data?.credits?.totalBalance)}</div>
            <div className="text-sm text-muted-foreground">
              窗口 SPEND：<span className="font-mono text-foreground">{fmtInt(data?.credits?.txWindow?.SPEND?.sum)}</span>
              <span className="text-muted-foreground">（{fmtInt(data?.credits?.txWindow?.SPEND?.count)}笔）</span>
            </div>
            <div className="text-sm text-muted-foreground">
              窗口 EARN：<span className="font-mono text-foreground">{fmtInt(data?.credits?.txWindow?.EARN?.sum)}</span>
              <span className="text-muted-foreground">（{fmtInt(data?.credits?.txWindow?.EARN?.count)}笔）</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>趋势：任务</CardTitle>
            <CardDescription>
              {trendDays.length ? `${trendDays[0]} ~ ${trendDays[trendDays.length - 1]}` : '暂无数据'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SparkLines
              series={[
                { name: 'Created', color: 'hsl(var(--primary))', data: trendTasksCreated },
                { name: 'Failed', color: 'hsl(var(--destructive))', data: trendTasksFailed },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>趋势：积分</CardTitle>
            <CardDescription>按天聚合（sum）</CardDescription>
          </CardHeader>
          <CardContent>
            <SparkLines
              series={[
                { name: 'EARN', color: 'hsl(var(--primary))', data: trendCreditsEarned },
                { name: 'SPEND', color: 'hsl(var(--muted-foreground))', data: trendCreditsSpent },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>趋势：新增用户</CardTitle>
          <CardDescription>按天聚合（count）</CardDescription>
        </CardHeader>
        <CardContent>
          <SparkLines series={[{ name: 'Users', color: 'hsl(var(--primary))', data: trendUsersCreated }]} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>任务状态分布</CardTitle>
            <CardDescription>按 status 聚合（全量）</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">加载中...</div>
            ) : taskStatusRows.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">暂无数据</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskStatusRows.map((r) => (
                    <TableRow key={r.status}>
                      <TableCell className="font-mono">{r.status}</TableCell>
                      <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>性能（窗口内采样）</CardTitle>
            <CardDescription>基于最近 {fmtInt(data?.tasks?.durationMsWindow?.sample)} 条可计算任务</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              平均耗时：<span className="font-mono text-foreground">{fmtMs(data?.tasks?.durationMsWindow?.avgMs ?? null)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              P50：<span className="font-mono text-foreground">{fmtMs(data?.tasks?.durationMsWindow?.p50Ms ?? null)}</span>
              <span className="ml-4 text-muted-foreground">
                P90：<span className="font-mono text-foreground">{fmtMs(data?.tasks?.durationMsWindow?.p90Ms ?? null)}</span>
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              窗口平均 creditsSpent：<span className="font-mono text-foreground">
                {avgCreditsSpentWindow === null || avgCreditsSpentWindow === undefined ? '-' : avgCreditsSpentWindow.toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>失败原因 Top</CardTitle>
            <CardDescription>任务 status=FAILED（窗口内）</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">加载中...</div>
            ) : (data?.tasks?.failureReasonsTop || []).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">暂无失败原因</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Count</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.tasks?.failureReasonsTop || []).map((r, idx) => (
                    <TableRow key={`${idx}-${r.error}`}>
                      <TableCell className="font-mono">{fmtInt(r.count)}</TableCell>
                      <TableCell className="font-mono text-xs break-all">{r.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分布：模型 / 尺寸 / 比例</CardTitle>
            <CardDescription>窗口内任务（基于 task.data 提取）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">Painter Model</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.distributions?.painterModel || []).map((r) => (
                    <TableRow key={`m-${r.key}`}>
                      <TableCell className="font-mono text-xs">{r.key}</TableCell>
                      <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium mb-2">Resolution</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.distributions?.resolution || []).map((r) => (
                      <TableRow key={`r-${r.key}`}>
                        <TableCell className="font-mono text-xs">{r.key}</TableCell>
                        <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Aspect Ratio</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.distributions?.aspectRatio || []).map((r) => (
                      <TableRow key={`a-${r.key}`}>
                        <TableCell className="font-mono text-xs">{r.key}</TableCell>
                        <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium mb-2">Workflow</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.distributions?.workflow || []).map((r) => (
                      <TableRow key={`w-${r.key}`}>
                        <TableCell className="font-mono text-xs">{r.key}</TableCell>
                        <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">includeThoughts</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.distributions?.includeThoughts || []).map((r) => (
                      <TableRow key={`t-${r.key}`}>
                        <TableCell className="font-mono text-xs">{r.key}</TableCell>
                        <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>积分流水（窗口）</CardTitle>
            <CardDescription>按类型聚合</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">加载中...</div>
            ) : txRows.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">暂无数据</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Sum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txRows.map((r) => (
                    <TableRow key={r.type}>
                      <TableCell>
                        <Badge variant={r.type === 'SPEND' ? 'secondary' : 'default'}>{r.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtInt(r.sum)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>预设库</CardTitle>
            <CardDescription>Face / Style（含 kind）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Face presets：<span className="font-mono text-foreground">{fmtInt(data?.presets?.facePresets)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Style presets（总）：<span className="font-mono text-foreground">{fmtInt(data?.presets?.stylePresets)}</span>
            </div>
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data?.presets?.stylePresetsByKind || {})
                    .map(([k, v]) => ({ k, v: Number(v || 0) }))
                    .sort((a, b) => b.v - a.v)
                    .map((r) => (
                      <TableRow key={r.k}>
                        <TableCell className="font-mono">{r.k}</TableCell>
                        <TableCell className="text-right font-mono">{fmtInt(r.v)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MCP（工具调用）</CardTitle>
          <CardDescription>
            Transport：{data?.mcp?.hasActiveTransport ? 'Active' : 'Inactive'}；最近调用：
            {data?.mcp?.lastToolCallAt ? ` ${new Date(data.mcp.lastToolCallAt).toLocaleString('zh-CN')}` : ' -'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : mcpToolRows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无工具数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mcpToolRows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-mono">{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{fmtInt(r.count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
