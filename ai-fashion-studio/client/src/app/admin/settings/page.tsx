'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BACKEND_ORIGIN } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

export default function SettingsPage() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setError('');
        setSuccess('');

        if (!currentPassword) {
            setError('请输入当前密码');
            return;
        }

        if (!username && !password && !nickname && !email) {
            setError('请至少填写一个需要更新的字段');
            return;
        }

        if (password && password.length < 6) {
            setError('新密码至少6位');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    username: username || undefined,
                    password: password || undefined,
                    nickname: nickname || undefined,
                    email: email || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || '更新失败');
                return;
            }

            useAuth.getState().login({ token: data.token, user: data.user });
            setSuccess('更新成功（已刷新登录态）');
            setCurrentPassword('');
            setPassword('');
        } catch (err: any) {
            console.error('更新失败:', err);
            setError(err?.message || '网络错误');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">账号安全</h2>
                <p className="text-muted-foreground mt-2">修改管理员账号信息（改账号/改密）</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>管理员凭据</CardTitle>
                    <CardDescription>为安全起见，更新前需要输入当前密码</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">当前密码（必填）</label>
                        <Input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="请输入当前密码"
                            autoComplete="current-password"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium mb-2">新用户名（可选）</label>
                            <Input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="不修改可留空"
                                autoComplete="username"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">新密码（可选）</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="至少6位，不修改可留空"
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium mb-2">昵称（可选）</label>
                            <Input
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="不修改可留空"
                                autoComplete="nickname"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">邮箱（可选）</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="不修改可留空"
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                            {success}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button onClick={handleSubmit} disabled={loading}>
                            {loading ? '保存中...' : '保存修改'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
