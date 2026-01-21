'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Settings, BarChart3, Palette, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { BACKEND_ORIGIN } from '@/lib/api';

type AdminUser = {
    nickname?: string;
    username?: string;
    role?: string;
    status?: string;
    totalTasks?: number;
};

type AuthMeResponse = {
    user?: AdminUser;
};

type AdminUsersResponse = {
    users?: AdminUser[];
};

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalTasks: 0,
        activeUsers: 0
    });
    const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
    const router = useRouter();
    const { logout } = useAuth();

    const loadStats = useCallback(async (token: string) => {
        try {
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = (await res.json()) as AdminUsersResponse;
            const users = Array.isArray(data?.users) ? data.users : [];

            setStats({
                totalUsers: users.length,
                totalTasks: users.reduce((sum, u) => sum + (u.totalTasks || 0), 0),
                activeUsers: users.filter((u) => u.status === 'ACTIVE').length
            });
        } catch (err: unknown) {
            console.error(err);
        }
    }, []);

    const checkAuth = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/admin/login');
            return;
        }

        try {
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                router.push('/admin/login');
                return;
            }

            const data = (await res.json()) as AuthMeResponse;

            if (data.user?.role !== 'ADMIN') {
                alert('需要管理员权限');
                router.push('/');
                return;
            }

            setCurrentUser(data.user ?? null);
            void loadStats(token);
        } catch (err: unknown) {
            console.error(err);
            router.push('/admin/login');
        }
    }, [loadStats, router]);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    const handleLogout = () => {
        logout();
        router.push('/admin/login');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900">管理后台</h1>
                        <p className="text-slate-600 mt-2">
                            欢迎, {currentUser?.nickname || currentUser?.username}
                        </p>
                    </div>
                    <Button onClick={handleLogout} variant="outline">
                        退出登录
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-6 md:grid-cols-3 mb-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">总用户数</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalUsers}</div>
                            <p className="text-xs text-muted-foreground">
                                {stats.activeUsers} 位活跃用户
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">总任务数</CardTitle>
                            <ListChecks className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalTasks}</div>
                            <p className="text-xs text-muted-foreground">
                                累计生成任务
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">系统状态</CardTitle>
                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">正常</div>
                            <p className="text-xs text-muted-foreground">
                                所有服务运行中
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Quick Actions */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Link href="/admin/users">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-100 rounded-lg">
                                        <Users className="h-6 w-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <CardTitle>用户管理</CardTitle>
                                        <CardDescription>管理系统用户和权限</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/tasks">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-green-100 rounded-lg">
                                        <ListChecks className="h-6 w-6 text-green-600" />
                                    </div>
                                    <div>
                                        <CardTitle>任务管理</CardTitle>
                                        <CardDescription>查看和管理生成任务</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/model-profiles">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-purple-100 rounded-lg">
                                        <Settings className="h-6 w-6 text-purple-600" />
                                    </div>
                                    <div>
                                        <CardTitle>系统设置</CardTitle>
                                        <CardDescription>配置API和系统参数</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/styles">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-pink-100 rounded-lg">
                                        <Palette className="h-6 w-6 text-pink-600" />
                                    </div>
                                    <div>
                                        <CardTitle>风格管理</CardTitle>
                                        <CardDescription>管理预设风格和模板</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>

                    <Link href="/admin/analytics">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-orange-100 rounded-lg">
                                        <BarChart3 className="h-6 w-6 text-orange-600" />
                                    </div>
                                    <div>
                                        <CardTitle>数据分析</CardTitle>
                                        <CardDescription>查看使用统计和趋势</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>
                </div>
            </div>
        </div>
    );
}
