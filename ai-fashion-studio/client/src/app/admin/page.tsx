'use client';

import useSWR from 'swr';
import {
    Users,
    ListChecks,
    Coins,
    HardDrive,
    Loader2
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell
} from 'recharts';

import { PageHeader } from '@/components/admin/shared/page-header';
import { StatCard } from '@/components/admin/shared/stat-card';
import { GlassCard } from '@/components/admin/shared/glass-card';
import { BACKEND_ORIGIN } from '@/lib/api';

const fetcher = (url: string) => {
    const token = localStorage.getItem('token');
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json());
};

type AnalyticsOverview = {
    usersByDay?: Array<{ day: string; count: number }>;
    tasksByDayStatus?: Array<{ day: string; status: string; count: number }>;
    distPainterModel?: Array<{ key: string; count: number }>;
    creditsTxWindow?: Array<{ type: string; _sum?: { amount?: number } }>;
    creditsTx24h?: Array<{ type: string; _sum?: { amount?: number } }>;
    failureReasonsTop?: Array<{ error?: string; count: number }>;
    usersCreatedLast24h?: number;
    tasksCreatedLast24h?: number;
    facePresetCount?: number;
    stylePresetCount?: number;
};

type StatsResponse = {
    users?: Array<{ status?: string; totalTasks?: number }>;
};

type TasksDataItem = Record<string, number | string>;
type ModelDistributionItem = { name: string; value: number };

const COLORS = ['#FF7A00', '#FF3F81', '#A855F7', '#3B82F6', '#10B981'];

export default function AdminDashboard() {
    const { data: stats, error, isLoading } = useSWR<StatsResponse>(
        `${BACKEND_ORIGIN}/api/auth/admin/users`,
        fetcher,
        {
            refreshInterval: 30000,
            revalidateOnFocus: false
        }
    );

    const { data: analytics, isLoading: isAnalyticsLoading } = useSWR<AnalyticsOverview>(
        `${BACKEND_ORIGIN}/api/admin/analytics/overview?days=7`,
        fetcher
    );

    if (isLoading || isAnalyticsLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[400px] text-slate-500">
                数据加载失败，请检查网络或权限
            </div>
        );
    }

    // Process real data from backend API
    const growthData = (analytics?.usersByDay || []).map((d) => ({
        date: new Date(d.day).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        value: Number(d.count)
    }));

    const tasksData = (analytics?.tasksByDayStatus || []).reduce<TasksDataItem[]>((acc, curr) => {
        const date = new Date(curr.day).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        const existing = acc.find(a => a.date === date);
        if (existing) {
            existing[curr.status] = Number(curr.count);
        } else {
            acc.push({ date, [curr.status]: Number(curr.count) });
        }
        return acc;
    }, []);

    const modelDistribution: ModelDistributionItem[] = (analytics?.distPainterModel || []).map((d) => ({
        name: d.key === '(unknown)' ? '未知模型' : d.key,
        value: Number(d.count)
    }));

    const users = Array.isArray(stats?.users) ? stats.users : [];
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
    const totalTasks = users.reduce((sum, u) => sum + (u.totalTasks || 0), 0);

    // Calculate total credits spent from transactions
    const totalCreditsSpent = analytics?.creditsTxWindow?.find((tx) => tx.type === 'SPEND')?._sum?.amount || 0;
    const creditsSpent24h = analytics?.creditsTx24h?.find((tx) => tx.type === 'SPEND')?._sum?.amount || 0;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PageHeader
                title="仪表盘"
                description="查看系统实时状态与运营指标概览"
            >
                {/* Header Actions can go here */}
            </PageHeader>

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="总注册用户"
                    value={totalUsers}
                    description={`${activeUsers} 位活跃用户`}
                    icon={Users}
                    variant="orange"
                    trend={{ value: `${analytics?.usersCreatedLast24h || 0}`, isUp: true }}
                />
                <StatCard
                    title="累计生成任务"
                    value={totalTasks.toLocaleString()}
                    description="AI 绘图请求总数"
                    icon={ListChecks}
                    variant="pink"
                    trend={{ value: `${analytics?.tasksCreatedLast24h || 0}`, isUp: true }}
                />
                <StatCard
                    title="积分总消耗"
                    value={Math.abs(totalCreditsSpent).toLocaleString()}
                    description="近 7 天累计消耗"
                    icon={Coins}
                    variant="purple"
                    trend={{ value: `${Math.abs(creditsSpent24h)}`, isUp: false }}
                />
                <StatCard
                    title="预置资源"
                    value={`${(analytics?.facePresetCount || 0) + (analytics?.stylePresetCount || 0)}`}
                    description={`${analytics?.facePresetCount || 0} 人脸 · ${analytics?.stylePresetCount || 0} 风格`}
                    icon={HardDrive}
                    variant="blue"
                />
            </div>

            {/* Charts Grid */}
            <div className="grid gap-6 md:grid-cols-7">
                {/* Main Trend Chart */}
                <GlassCard className="col-span-4 min-h-[400px]">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">用户增长趋势</h3>
                        <p className="text-sm text-slate-500">近 7 天新增用户统计 / New Users Trend</p>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={growthData}>
                                <defs>
                                    <linearGradient id="colorUser" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FF7A00" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#FF7A00" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#FF7A00"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorUser)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                {/* Model Distribution */}
                <GlassCard className="col-span-3 min-h-[400px]">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">模型偏好分布</h3>
                        <p className="text-sm text-slate-500">用户最爱使用的 AI 模型 Top 5</p>
                    </div>
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={modelDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {modelDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>
            </div>

            {/* Task Stats Row */}
            <div className="grid gap-6 md:grid-cols-2">
                <GlassCard>
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">任务状态分布</h3>
                            <p className="text-sm text-slate-500">最近 7 天生成成功率监控</p>
                        </div>
                    </div>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tasksData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                <Bar dataKey="COMPLETED" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} barSize={20} />
                                <Bar dataKey="FAILED" stackId="a" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                <GlassCard>
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">失败原因 Top 5</h3>
                        <p className="text-sm text-slate-500">需关注的系统异常</p>
                    </div>
                    <div className="space-y-4">
                        {(analytics?.failureReasonsTop || []).map((item, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">
                                        {i + 1}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]" title={item.error}>
                                        {item.error || 'Unknown Error'}
                                    </span>
                                </div>
                                <span className="text-sm font-mono text-slate-500">{Number(item.count)} 次</span>
                            </div>
                        ))}
                        {(!analytics?.failureReasonsTop || analytics.failureReasonsTop.length === 0) && (
                            <div className="text-center text-slate-400 py-8">暂无失败记录</div>
                        )}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
