'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sparkles, History, User, Settings, LogIn, Coins, GraduationCap, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCredits } from '@/hooks/use-credits';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserNavbar() {
    const pathname = usePathname();
    const { isAuthenticated, user, logout } = useAuth();
    const { balance, loading: creditsLoading } = useCredits();

    const navItems = [
        { href: '/', label: '创作中心', icon: Sparkles },
        { href: '/learn', label: '学习与生成', icon: GraduationCap },
        { href: '/history', label: '历史记录', icon: History },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b border-[#FF7F50] bg-[#FF7F50] shadow-md transition-colors duration-300">
            <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
                {/* Logo */}
                <div className="flex items-center gap-2 mr-4">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white transition-opacity hover:opacity-90 tracking-tight">
                        <span>AI Fashion Studio</span>
                    </Link>
                </div>

                {/* Main Nav */}
                <nav className="flex items-center space-x-6 text-sm font-medium">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-1.5 transition-colors hover:text-white/90 hover:bg-white/10 px-3 py-1.5 rounded-full",
                                    isActive ? "bg-white text-[#FF7F50] font-bold shadow-sm" : "text-white/80"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* User Actions */}
                <div className="flex items-center gap-4">
                    {/* 积分显示 */}
                    {isAuthenticated && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-full border border-white/30 hover:bg-white/30 transition-colors">
                            <Coins className="h-4 w-4 text-white" />
                            <span className="text-sm font-bold text-white">
                                {creditsLoading ? '...' : balance}
                            </span>
                        </div>
                    )}

                    <Link href="/settings">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-white hover:bg-white/20 hover:text-white">
                            <Settings className="h-5 w-5" />
                            <span className="sr-only">设置</span>
                        </Button>
                    </Link>

                    {isAuthenticated ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-9 px-2 gap-2 rounded-full text-white hover:bg-white/20 hover:text-white">
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#FF7F50] text-xs font-bold ring-2 ring-white/20">
                                        {(user?.nickname || user?.username || 'U').slice(0, 1).toUpperCase()}
                                    </span>
                                    <span className="text-sm font-medium max-w-[120px] truncate">
                                        {user?.nickname || user?.username || '用户'}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-white/70" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>账户</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/profile" className="flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        个人中心
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                                    onClick={() => logout()}
                                >
                                    <LogOut className="h-4 w-4" />
                                    退出登录
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Link href="/login">
                            <Button variant="secondary" size="sm" className="gap-2 bg-white text-[#FF7F50] hover:bg-white/90 border-0 font-bold">
                                <LogIn className="h-4 w-4" />
                                登录
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
