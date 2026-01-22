import * as React from 'react';
import { cn } from '@/lib/utils';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    hoverEffect?: boolean;
    intensity?: 'low' | 'medium' | 'high';
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
    ({ className, hoverEffect = false, intensity = 'medium', children, ...props }, ref) => {

        const intensityMap = {
            low: 'bg-white/[0.02] border-white/5 backdrop-blur-md',
            medium: 'bg-white/[0.05] border-white/10 backdrop-blur-lg',
            high: 'bg-white/[0.08] border-white/15 backdrop-blur-xl',
        };

        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-2xl border shadow-xl transition-all duration-300',
                    intensityMap[intensity],
                    hoverEffect && 'hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5',
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);
GlassPanel.displayName = 'GlassPanel';
