'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function AuroraBackground({ children, className }: { children?: React.ReactNode; className?: string }) {
    return (
        <div className={cn("relative min-h-screen w-full overflow-hidden bg-slate-950", className)}>
            {/* 极光层 */}
            <div className="absolute inset-0 z-0 opacity-50 pointer-events-none">
                {/* 青色极光 */}
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/20 blur-[100px] animate-aurora-1" />
                {/* 紫色极光 */}
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-purple-600/20 blur-[120px] animate-aurora-2" />
                {/* 洋红极光 */}
                <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/15 blur-[90px] animate-aurora-3" />

                {/* 噪点纹理叠加 */}
                <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("/noise.png")' }}></div>
            </div>

            {/* 内容层 */}
            <div className="relative z-10 w-full h-full">
                {children}
            </div>
        </div>
    );
}
