'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';

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
            <div className="flex min-h-screen items-center justify-center bg-muted/20">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">验证权限中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-muted/20">
            <AdminSidebar />
            <div className="flex-1 flex flex-col min-h-screen">
                <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-6 lg:h-[60px] justify-between">
                    <h1 className="font-semibold text-lg">控制台</h1>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-muted-foreground">
                            {user?.username || user?.email}
                        </div>
                    </div>
                </header>
                <main className="flex-1 p-4 lg:p-6 bg-background/50">
                    {children}
                </main>
            </div>
            <Toaster />
        </div>
    );
}
