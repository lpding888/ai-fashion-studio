import { UserNavbar } from '@/components/layout/user-navbar';
import { Toaster } from '@/components/ui/toaster';

export default function UserLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="relative min-h-screen bg-background font-sans antialiased">
            {/* Background Pattern */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-white dark:bg-slate-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)]"></div>

            <UserNavbar />
            <main className="flex-1">
                {children}
            </main>

            <footer className="py-6 md:px-8 md:py-0">
                <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
                    <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                        Built by <span className="font-semibold">AI Fashion Studio</span>. The source code is available on <a href="#" className="font-medium underline underline-offset-4">GitHub</a>.
                    </p>
                </div>
            </footer>
            <Toaster />
        </div>
    );
}
