'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
}

export function GlassCard({ children, className, hover = true }: GlassCardProps) {
    return (
        <motion.div
            whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
                "rounded-2xl border border-white/40 bg-white/60 p-6 backdrop-blur-xl shadow-sm",
                hover && "hover:shadow-lg transition-shadow duration-300",
                className
            )}
        >
            {children}
        </motion.div>
    );
}
