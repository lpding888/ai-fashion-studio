import * as React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NeonButtonProps extends ButtonProps {
    glowColor?: 'cyan' | 'purple' | 'fuchsia';
    size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const NeonButton = React.forwardRef<HTMLButtonElement, NeonButtonProps>(
    ({ className, glowColor = 'cyan', size, children, ...props }, ref) => {

        const glowStyles = {
            cyan: 'shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] border-cyan-400/30 text-cyan-50 bg-cyan-500/10 hover:bg-cyan-500/20',
            purple: 'shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] border-purple-400/30 text-purple-50 bg-purple-500/10 hover:bg-purple-500/20',
            fuchsia: 'shadow-[0_0_15px_rgba(217,70,239,0.3)] hover:shadow-[0_0_25px_rgba(217,70,239,0.5)] border-fuchsia-400/30 text-fuchsia-50 bg-fuchsia-500/10 hover:bg-fuchsia-500/20',
        };

        return (
            <Button
                ref={ref}
                size={size}
                className={cn(
                    'border transition-all duration-300 font-medium tracking-wide',
                    glowStyles[glowColor],
                    className
                )}
                {...props}
            >
                {children}
            </Button>
        );
    }
);
NeonButton.displayName = 'NeonButton';
