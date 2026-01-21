'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BACKEND_ORIGIN } from '@/lib/api';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();
    const { login } = useAuth();
    const [focusedInput, setFocusedInput] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 使用真实的认证API
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: email,  // 使用username字段
                    password
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || '登录失败');
            }

            login({ token: data.token, user: data.user });

            if (data.user.role === 'ADMIN') {
                router.push('/admin');
            } else {
                router.push('/');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '登录失败，请检查账号密码');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-slate-950">
            {/* Dynamic Background */}
            <div className="absolute inset-0 w-full h-full">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/20 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/20 blur-[120px] animate-pulse delay-1000" />
                <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] rounded-full bg-pink-500/10 blur-[100px] animate-pulse delay-2000" />
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative z-10 w-full max-w-md px-4"
            >
                {/* Brand Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 backdrop-blur-xl mb-6 shadow-2xl shadow-purple-500/10 group cursor-default">
                        <Sparkles className="w-8 h-8 text-white group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/60">
                        AI Fashion Studio
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        管理员控制台登录
                    </p>
                </div>

                {/* Glass Card */}
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/50">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2 group">
                            <Label className="text-slate-300 text-xs font-medium uppercase tracking-wider ml-1">用户名</Label>
                            <div className="relative transition-all duration-300">
                                <Input
                                    type="text"
                                    placeholder="admin"
                                    className="bg-black/20 border-white/5 text-white placeholder:text-slate-600 h-12 rounded-xl focus:bg-black/40 focus:border-purple-500/50 transition-all duration-300"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onFocus={() => setFocusedInput('email')}
                                    onBlur={() => setFocusedInput(null)}
                                    disabled={loading}
                                />
                                <div className={`absolute bottom-0 left-0 h-[1px] bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ${focusedInput === 'email' ? 'w-full opacity-100' : 'w-0 opacity-0'}`} />
                            </div>
                        </div>

                        <div className="space-y-2 group">
                            <div className="flex justify-between items-center ml-1">
                                <Label className="text-slate-300 text-xs font-medium uppercase tracking-wider">密码</Label>
                                <div className="hidden group-focus-within:block text-[10px] text-purple-400 animate-in fade-in slide-in-from-right-2">
                                    admin / admin123
                                </div>
                            </div>
                            <div className="relative transition-all duration-300">
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    className="bg-black/20 border-white/5 text-white placeholder:text-slate-600 h-12 rounded-xl focus:bg-black/40 focus:border-blue-500/50 transition-all duration-300"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onFocus={() => setFocusedInput('password')}
                                    onBlur={() => setFocusedInput(null)}
                                    disabled={loading}
                                />
                                <div className={`absolute bottom-0 left-0 h-[1px] bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ${focusedInput === 'password' ? 'w-full opacity-100' : 'w-0 opacity-0'}`} />
                            </div>
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20"
                                >
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <Button
                            type="submit"
                            className="w-full h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 relative overflow-hidden group"
                            disabled={loading}
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl" />
                            <span className="relative flex items-center justify-center gap-2">
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        登录中...
                                    </>
                                ) : (
                                    <>
                                        进入控制台
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </span>
                        </Button>
                    </form>

                    {/* Quick Login Hint */}
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <div className="flex justify-center gap-3">
                            <Badge
                                variant="outline"
                                className="bg-white/5 hover:bg-white/10 cursor-pointer border-white/10 text-slate-400 hover:text-white transition-colors py-1.5 px-3"
                                onClick={() => { setEmail('admin'); setPassword('admin123'); }}
                            >
                                管理员账号
                            </Badge>
                        </div>
                    </div>
                </div>

                <p className="text-center text-slate-500 text-xs mt-8">
                    &copy; 2024 AI Fashion Studio. All rights reserved.
                </p>
            </motion.div>
        </div>
    );
}
