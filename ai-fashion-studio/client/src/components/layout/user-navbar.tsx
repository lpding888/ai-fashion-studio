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
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
                {/* Logo */}
                <div className="flex items-center gap-2 mr-4">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent transition-opacity hover:opacity-80">
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
                                    "flex items-center gap-1.5 transition-colors hover:text-foreground/80",
                                    isActive ? "text-foreground font-semibold" : "text-foreground/60"
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
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-full border border-amber-500/20">
                            <Coins className="h-4 w-4 text-amber-500" />
                            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                {creditsLoading ? '...' : balance}
                            </span>
                            <span className="text-xs text-muted-foreground">积分</span>
                        </div>
                    )}

                    <Link href="/settings">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                            <Settings className="h-5 w-5" />
                            <span className="sr-only">设置</span>
                        </Button>
                    </Link>

                    {isAuthenticated ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-9 px-2 gap-2 rounded-full">
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                        {(user?.nickname || user?.username || 'U').slice(0, 1).toUpperCase()}
                                    </span>
                                    <span className="text-sm font-medium max-w-[120px] truncate">
                                        {user?.nickname || user?.username || '用户'}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
                            <Button variant="outline" size="sm" className="gap-2">
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
