'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { BACKEND_ORIGIN } from '@/lib/api';
import Link from 'next/link';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleLogin = async () => {
        if (!username || !password) {
            setError('请输入用户名和密码');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || '登录失败');
                setLoading(false);
                return;
            }

            login({ token: data.token, user: data.user });

            console.log('✅ 登录成功:', data.user);
            console.log('🔑 Token已保存:', data.token.substring(0, 20) + '...');
            console.log('👤 用户角色:', data.user.role);

            // 如果有匿名草稿任务：登录后自动认领
            const pendingTaskId = localStorage.getItem('pending_task_id');
            const pendingClaimToken = localStorage.getItem('pending_task_claim_token');

            if (pendingTaskId && pendingClaimToken) {
                try {
                    const claimRes = await fetch(`${BACKEND_ORIGIN}/api/tasks/${pendingTaskId}/claim`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${data.token}`,
                        },
                        body: JSON.stringify({ claimToken: pendingClaimToken }),
                    });

                    if (!claimRes.ok) {
                        const claimData = await claimRes.json().catch(() => ({}));
                        console.warn('草稿认领失败:', claimData?.message || claimRes.statusText);
                    }
                } finally {
                    localStorage.removeItem('pending_task_id');
                    localStorage.removeItem('pending_task_claim_token');
                }
            }

            const next = new URLSearchParams(window.location.search).get('next') || '/';
            window.location.href = next;
        } catch (err) {
            console.error('登录错误:', err);
            setError('网络错误，请检查服务器是否启动');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-4">
            <Card className="w-full max-w-md p-8 bg-zinc-900/50 backdrop-blur border-zinc-800">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mb-2">
                        AI Fashion Studio
                    </h1>
                    <p className="text-zinc-400 text-sm">内测用户登录</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            用户名
                        </label>
                        <Input
                            type="text"
                            placeholder="请输入用户名"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            密码
                        </label>
                        <Input
                            type="password"
                            placeholder="请输入密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <Button
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-medium"
                    >
                        {loading ? '登录中...' : '登录'}
                    </Button>

                    <div className="text-center text-sm text-zinc-400">
                        没有账号？{' '}
                        <Link href="/register" className="text-purple-300 hover:text-purple-200">
                            去注册
                        </Link>
                    </div>

                    <div className="mt-6 p-4 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
                        <p className="text-xs text-zinc-400 mb-2">💡 内测说明：</p>
                        <div className="text-xs text-zinc-500 space-y-1">
                            <div>• 内测阶段：注册需要邀请码（一次性）</div>
                            <div>• 登录后可进入创作中心开始生图</div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
