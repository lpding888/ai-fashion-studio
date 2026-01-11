'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { BACKEND_ORIGIN } from '@/lib/api';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [email, setEmail] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
        if (!username || !password) {
            setError('请输入用户名和密码');
            return;
        }

        if (password.length < 6) {
            setError('密码至少6位');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    nickname: nickname || undefined,
                    email: email || undefined,
                    inviteCode: inviteCode || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || '注册失败');
                setLoading(false);
                return;
            }

            setSuccess(data.message || '注册成功，等待管理员审核');
        } catch (err) {
            console.error('注册错误:', err);
            setError('网络错误，请检查服务器是否启动');
        } finally {
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
                    <p className="text-zinc-400 text-sm">用户注册（邀请码）</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">用户名</label>
                        <Input
                            type="text"
                            placeholder="请输入用户名"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">密码</label>
                        <Input
                            type="password"
                            placeholder="至少6位"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="new-password"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">昵称（可选）</label>
                        <Input
                            type="text"
                            placeholder="显示名称"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="nickname"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">邮箱（可选）</label>
                        <Input
                            type="email"
                            placeholder="user@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">邀请码</label>
                        <Input
                            type="text"
                            placeholder="请输入管理员提供的邀请码"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                            autoComplete="off"
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
                            {success}
                        </div>
                    )}

                    <Button
                        onClick={handleRegister}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-medium"
                    >
                        {loading ? '提交中...' : '提交注册'}
                    </Button>

                    <div className="text-center text-sm text-zinc-400">
                        已有账号？{' '}
                        <Link href="/login" className="text-purple-300 hover:text-purple-200">
                            去登录
                        </Link>
                    </div>

                    <div className="mt-6 p-4 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
                        <p className="text-xs text-zinc-400 mb-2">说明：</p>
                        <div className="text-xs text-zinc-500 space-y-1">
                            <div>• 当前为内测阶段：注册需要邀请码（一次性）</div>
                            <div>• 注册成功后可直接登录</div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
