import * as React from 'react';
import { cn } from '@/lib/utils';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    hoverEffect?: boolean;
    intensity?: 'low' | 'medium' | 'high';
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
    ({ className, hoverEffect = false, intensity = 'medium', children, ...props }, ref) => {

        const intensityMap = {
            low: 'bg-white/10 border-white/10 backdrop-blur-md shadow-sm',
            medium: 'bg-white/30 border-white/30 backdrop-blur-lg shadow-md',
            high: 'bg-white/50 border-white/40 backdrop-blur-xl shadow-xl saturate-150',
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
