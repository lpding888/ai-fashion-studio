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

            // 🎯 管理员也需要试用产品：统一进入用户端，再从个人中心进入管理后台
            console.log('🚀 跳转到用户主页: /');
            window.location.href = '/';
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
                            <div>• 可通过注册页提交账号，需管理员审核通过后登录</div>
                            <div>• 管理员默认账号：admin / admin123</div>
                            <div>• 首次登录建议修改密码</div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
