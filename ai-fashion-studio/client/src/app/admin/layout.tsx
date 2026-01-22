'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, Bell } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { isAuthenticated, isAdmin, user, hasHydrated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!hasHydrated) return;
        if (pathname.startsWith('/admin/login')) return;

        // Check authentication on mount and when auth state changes
        if (!isAuthenticated) {
            router.push('/admin/login');
        } else if (!isAdmin) {
            router.push('/');
        }
    }, [hasHydrated, isAuthenticated, isAdmin, pathname, router]);

    if (pathname.startsWith('/admin/login')) {
        return children;
    }

    // Show loading while checking auth or redirecting
    if (!hasHydrated || !isAuthenticated || !isAdmin) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="text-center space-y-4">
                    <div className="relative">
                        <Loader2 className="h-10 w-10 animate-spin mx-auto text-orange-500" />
                        <div className="absolute inset-0 blur-xl bg-orange-500/20 animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">验证管理员权限...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#F8F9FA] selection:bg-orange-100 selection:text-orange-900">
            {/* Background Mesh Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -right-[5%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-orange-200/20 to-pink-200/20 blur-[120px]" />
                <div className="absolute top-[20%] -left-[5%] w-[30%] h-[30%] rounded-full bg-gradient-to-tr from-blue-200/10 to-indigo-200/10 blur-[100px]" />
            </div>

            <AdminSidebar />

            <div className="flex-1 flex flex-col min-h-screen relative z-10">
                <header className="flex h-16 items-center gap-4 border-b border-white/40 bg-white/40 backdrop-blur-md px-6 justify-between sticky top-0 z-20">
                    <div className="flex items-center gap-2 text-slate-400">
                        <span className="text-sm font-medium">后台管理</span>
                        <span className="text-xs">/</span>
                        <h1 className="font-semibold text-slate-900 capitalize">
                            {pathname.split('/').pop() || '仪表盘'}
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="text-slate-500 hover:bg-white/50 rounded-xl">
                            <Bell className="h-5 w-5" />
                        </Button>

                        <div className="h-8 w-[1px] bg-slate-200 mx-2" />

                        <div className="flex items-center gap-3 pl-2">
                            <div className="text-right hidden sm:block">
                                <div className="text-sm font-semibold text-slate-900">{user?.nickname || user?.username}</div>
                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">系统管理员</div>
                            </div>
                            <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                                <AvatarImage src={user?.email ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}` : ''} />
                                <AvatarFallback className="bg-orange-100 text-orange-600 font-bold uppercase">
                                    {(user?.nickname || user?.username || 'A').slice(0, 1)}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-6 md:p-8">
                    {children}
                </main>
            </div>
            <Toaster />
        </div>
    );
}
