
import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'AI Fashion Studio - 无界设计',
    description: 'AI 驱动的时装设计工作室',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh">
            <body className={inter.className}>
                {children}
            </body>
        </html>
    );
}
