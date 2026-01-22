'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    Users,
    ListChecks,
    Settings2,
    LineChart,
    Palette,
    Brain,
    Layers,
    Wand2,
    BookOpen,
    KeyRound,
    Ticket,
    LogOut,
    Coins,
    ScrollText,
    Network,
    ChevronRight,
    Shuffle,
    Sparkles
} from 'lucide-react';

export function AdminSidebar() {
    const pathname = usePathname();

    const sidebarItems = [
        { href: '/admin', label: '控制面板', icon: LayoutDashboard },
        { href: '/admin/users', label: '用户管理', icon: Users },
        { href: '/admin/invite-codes', label: '邀请管理', icon: Ticket },
        { href: '/admin/credits', label: '财务管理', icon: Coins },
        { href: '/admin/tasks', label: '任务审核', icon: ListChecks },
        { href: '/admin/logs', label: '实时日志', icon: ScrollText },
        { href: '/admin/mcp', label: '模型连接', icon: Network },
        { href: '/admin/brain-prompts', label: '大脑设定', icon: Brain },
        { href: '/admin/workflow-prompts', label: '工作流设定', icon: Layers },
        { href: '/admin/direct-prompts', label: '直出设定', icon: Wand2 },
        { href: '/admin/learn-prompts', label: '学习设定', icon: BookOpen },
        { href: '/admin/prompt-optimizer-prompts', label: '优化设定', icon: Sparkles },
        { href: '/admin/styles', label: '预设风格', icon: Palette },
        { href: '/admin/analytics', label: '运营分析', icon: LineChart },
        { href: '/admin/model-profiles', label: '模型参数', icon: Settings2 },
        { href: '/admin/brain-routing', label: '大脑路由', icon: Shuffle },
        { href: '/admin/settings', label: '系统设置', icon: KeyRound },
    ];

    return (
        <aside className="hidden h-screen w-64 flex-col border-r border-white/20 bg-white/40 backdrop-blur-xl md:flex shrink-0">
            {/* Brand */}
            <div className="flex h-16 items-center px-6">
                <Link href="/admin" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-orange-500/20">
                        A
                    </div>
                    <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
                        Admin<span className="text-orange-500">Panel</span>
                    </span>
                </Link>
            </div>

            {/* Nav */}
            <div className="flex-1 overflow-auto py-6">
                <nav className="grid items-start px-4 gap-1 text-sm font-medium">
                    {sidebarItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300",
                                    isActive
                                        ? "bg-white text-orange-600 shadow-sm shadow-orange-500/5 font-semibold"
                                        : "text-slate-500 hover:text-orange-600 hover:bg-white/50"
                                )}
                            >
                                <Icon className={cn(
                                    "h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                                    isActive ? "text-orange-500" : "text-slate-400 group-hover:text-orange-500"
                                )} />
                                <span className="flex-1">{item.label}</span>
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute left-0 w-1 h-5 bg-orange-500 rounded-full"
                                    />
                                )}
                                <ChevronRight className={cn(
                                    "h-4 w-4 opacity-0 transition-opacity",
                                    isActive ? "opacity-40" : "group-hover:opacity-20"
                                )} />
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Footer / Logout */}
            <div className="p-4 mt-auto">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-50/50 transition-colors"
                    onClick={() => {
                        localStorage.removeItem('token');
                        window.location.href = '/admin/login';
                    }}
                >
                    <LogOut className="h-5 w-5" />
                    <span>退出系统</span>
                </Button>
            </div>
        </aside>
    );
}
