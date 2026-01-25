
import "./globals.css";
import type { Metadata } from "next";

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
            <body className="font-sans antialiased">
                {children}
            </body>
        </html>
    );
}
