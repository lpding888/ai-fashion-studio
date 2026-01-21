'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    User,
    TrendingUp,
    Clock,
    Settings,
    Upload
} from 'lucide-react';

type ProfileTask = {
    id: string;
    status: string;
    requirements: string;
    createdAt: number;
};

export default function ProfilePage() {
    const { isAdmin } = useAuth();
    const [tasks, setTasks] = useState<ProfileTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [profileData, setProfileData] = useState({
        username: '用户',
        email: 'user@example.com',
        avatar: '',
    });
    const [preferences, setPreferences] = useState({
        defaultResolution: '2K',
        defaultAspectRatio: '16:9',
        autoApprove: false,
    });

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const res = await api.get('/tasks');
            setTasks(res.data?.tasks || []);
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'COMPLETED').length,
        failed: tasks.filter(t => t.status === 'FAILED').length,
        successRate: tasks.length > 0
            ? ((tasks.filter(t => t.status === 'COMPLETED').length / tasks.length) * 100).toFixed(1)
            : '0',
    };

    const handleSaveProfile = () => {
        // TODO: API call to save profile
        alert('个人信息已保存！');
    };

    const handleSavePreferences = () => {
        // TODO: Save preferences to localStorage or API
        localStorage.setItem('userPreferences', JSON.stringify(preferences));
        alert('偏好设置已保存！');
    };

    return (
        <div className="container py-8 max-w-screen-xl min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 mb-2">
                    个人中心
                </h1>
                <p className="text-slate-500">
                    管理您的账号信息和使用偏好
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Profile & Stats */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Profile Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                基本信息
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Avatar */}
                            <div className="flex flex-col items-center gap-3">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                                        {profileData.username.charAt(0).toUpperCase()}
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="secondary"
                                        className="absolute bottom-0 right-0 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <Separator />

                            {/* Username */}
                            <div className="space-y-2">
                                <Label htmlFor="username">用户名</Label>
                                <Input
                                    id="username"
                                    value={profileData.username}
                                    onChange={(e) => setProfileData({ ...profileData, username: e.target.value })}
                                    placeholder="请输入用户名"
                                />
                            </div>

                            {/* Email */}
                            <div className="space-y-2">
                                <Label htmlFor="email">邮箱</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={profileData.email}
                                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                                    placeholder="user@example.com"
                                />
                            </div>

                            <Button onClick={handleSaveProfile} className="w-full">
                                保存信息
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Stats Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                使用统计
                            </CardTitle>
                            <CardDescription>您的创作数据概览</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-center p-3 bg-slate-50 rounded-lg">
                                    <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                                    <div className="text-xs text-slate-500 mt-1">总任务数</div>
                                </div>
                                <div className="text-center p-3 bg-green-50 rounded-lg">
                                    <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                                    <div className="text-xs text-slate-500 mt-1">已完成</div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-600">成功率</span>
                                    <Badge variant="default" className="bg-green-500">
                                        {stats.successRate}%
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-600">失败任务</span>
                                    <span className="text-sm font-medium text-red-500">{stats.failed}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Preferences */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                使用偏好
                            </CardTitle>
                            <CardDescription>
                                设置您的默认参数，创建任务时将自动应用
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Default Resolution */}
                            <div className="space-y-2">
                                <Label htmlFor="resolution">默认分辨率</Label>
                                <Select
                                    value={preferences.defaultResolution}
                                    onValueChange={(value) => setPreferences({ ...preferences, defaultResolution: value })}
                                >
                                    <SelectTrigger id="resolution">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1K">1K (1024x1024)</SelectItem>
                                        <SelectItem value="2K">2K (2048x2048)</SelectItem>
                                        <SelectItem value="4K">4K (4096x4096)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500">
                                    更高分辨率生成时间更长，但图片质量更好
                                </p>
                            </div>

                            <Separator />

                            {/* Default Aspect Ratio */}
                            <div className="space-y-2">
                                <Label htmlFor="aspectRatio">默认画面比例</Label>
                                <Select
                                    value={preferences.defaultAspectRatio}
                                    onValueChange={(value) => setPreferences({ ...preferences, defaultAspectRatio: value })}
                                >
                                    <SelectTrigger id="aspectRatio">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1:1">1:1 (正方形)</SelectItem>
                                        <SelectItem value="4:3">4:3 (标准)</SelectItem>
                                        <SelectItem value="3:4">3:4 (竖版)</SelectItem>
                                        <SelectItem value="16:9">16:9 (宽屏)</SelectItem>
                                        <SelectItem value="9:16">9:16 (短视频)</SelectItem>
                                        <SelectItem value="21:9">21:9 (超宽)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Separator />

                            {/* Auto Approve */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="autoApprove">自动审批</Label>
                                    <p className="text-xs text-slate-500">
                                        跳过Brain方案审批，直接生成图片
                                    </p>
                                </div>
                                <Button
                                    variant={preferences.autoApprove ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setPreferences({ ...preferences, autoApprove: !preferences.autoApprove })}
                                >
                                    {preferences.autoApprove ? '已启用' : '已禁用'}
                                </Button>
                            </div>

                            <Separator />

                            {isAdmin && (
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>管理后台</Label>
                                        <p className="text-xs text-slate-500">
                                            进入管理控制台进行用户与任务管理
                                        </p>
                                    </div>
                                    <Link href="/admin">
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <Settings className="h-4 w-4" />
                                            进入管理页
                                        </Button>
                                    </Link>
                                </div>
                            )}

                            {isAdmin && <Separator />}

                            {/* Save Button */}
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => {
                                    setPreferences({
                                        defaultResolution: '2K',
                                        defaultAspectRatio: '16:9',
                                        autoApprove: false,
                                    });
                                }}>
                                    重置为默认
                                </Button>
                                <Button onClick={handleSavePreferences}>
                                    保存偏好设置
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                最近活动
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="text-center py-8 text-slate-500">加载中...</div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    暂无活动记录
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks.slice(0, 5).map((task) => (
                                        <div
                                            key={task.id}
                                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                                        >
                                            <div className={`w-2 h-2 rounded-full ${task.status === 'COMPLETED' ? 'bg-green-500' :
                                                task.status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500'
                                                }`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">
                                                    {task.requirements}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {new Date(task.createdAt).toLocaleString('zh-CN')}
                                                </p>
                                            </div>
                                            <Badge variant={task.status === 'COMPLETED' ? 'default' : 'secondary'} className="text-xs">
                                                {task.status === 'COMPLETED' ? '已完成' :
                                                    task.status === 'FAILED' ? '失败' : '进行中'}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
