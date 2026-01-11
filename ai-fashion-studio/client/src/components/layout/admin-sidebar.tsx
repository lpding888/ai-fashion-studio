'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    LayoutDashboard,
    Users,
    ListChecks,
    Settings2,
    LineChart,
    Palette,
    Brain,
    Layers,
    KeyRound,
    Ticket,
    LogOut,
    Coins
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export function AdminSidebar() {
    const pathname = usePathname();

    const sidebarItems = [
        { href: '/admin', label: '仪表盘', icon: LayoutDashboard },
        { href: '/admin/users', label: '用户管理', icon: Users },
        { href: '/admin/invite-codes', label: '邀请码', icon: Ticket },
        { href: '/admin/credits', label: '积分管理', icon: Coins }, // 新增
        { href: '/admin/tasks', label: '任务审核', icon: ListChecks },
        { href: '/admin/brain-prompts', label: '大脑提示词', icon: Brain },
        { href: '/admin/workflow-prompts', label: '工作流提示词', icon: Layers },
        { href: '/admin/styles', label: '风格库', icon: Palette },
        { href: '/admin/analytics', label: '数据分析', icon: LineChart },
        { href: '/admin/model-profiles', label: '模型配置', icon: Settings2 },
        { href: '/admin/settings', label: '账号安全', icon: KeyRound },
    ];

    return (
        <aside className="hidden h-screen w-64 flex-col border-r bg-muted/40 md:flex">
            {/* Brand */}
            <div className="flex h-14 items-center border-b px-6 lg:h-[60px]">
                <Link href="/admin" className="flex items-center gap-2 font-bold text-lg">
                    <span className="text-primary">Admin Panel</span>
                </Link>
            </div>

            {/* Nav */}
            <div className="flex-1 overflow-auto py-4">
                <nav className="grid items-start px-4 text-sm font-medium">
                    {sidebarItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:text-primary",
                                    isActive
                                        ? "bg-primary text-primary-foreground hover:text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Footer / Logout */}
            <div className="mt-auto p-4 border-t">
                <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                        const { logout } = useAuth.getState();
                        logout();
                        window.location.href = '/admin/login';
                    }}
                >
                    <LogOut className="h-4 w-4" />
                    <span>退出登录</span>
                </Button>
            </div>
        </aside>
    );
}
