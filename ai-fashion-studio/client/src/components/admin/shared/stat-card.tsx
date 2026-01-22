'use client';

import { GlassCard } from './glass-card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: {
        value: string;
        isUp: boolean;
    };
    variant?: 'orange' | 'pink' | 'purple' | 'blue' | 'green' | 'default';
}

const variants = {
    default: "bg-white/60 text-slate-900 icon-bg-slate-100",
    orange: "border-orange-100/50 icon-bg-orange-50 icon-text-orange-500",
    pink: "border-pink-100/50 icon-bg-pink-50 icon-text-pink-500",
    purple: "border-purple-100/50 icon-bg-purple-50 icon-text-purple-500",
    blue: "border-blue-100/50 icon-bg-blue-50 icon-text-blue-500",
    green: "border-green-100/50 icon-bg-green-50 icon-text-green-500",
};

const iconGradients = {
    default: "bg-slate-100 text-slate-500",
    orange: "bg-orange-50 text-orange-500",
    pink: "bg-pink-50 text-pink-500",
    purple: "bg-purple-50 text-purple-500",
    blue: "bg-blue-50 text-blue-500",
    green: "bg-green-50 text-green-500",
};

export function StatCard({ title, value, description, icon: Icon, trend, variant = 'default' }: StatCardProps) {
    return (
        <GlassCard className={cn("relative overflow-hidden", variants[variant])}>
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    <div className="text-3xl font-bold tracking-tight">{value}</div>
                    {trend && (
                        <div className={cn(
                            "flex items-center gap-1 text-xs font-medium",
                            trend.isUp ? "text-emerald-600" : "text-rose-600"
                        )}>
                            <span>{trend.isUp ? '↑' : '↓'}</span>
                            <span>{trend.value}</span>
                            <span className="text-slate-400 font-normal ml-1">较上周</span>
                        </div>
                    )}
                    {!trend && description && (
                        <p className="text-xs text-slate-400">{description}</p>
                    )}
                </div>
                <div className={cn("p-3 rounded-xl", iconGradients[variant])}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>

            {/* Subtle background glow for colored variants */}
            {variant !== 'default' && (
                <div className={cn(
                    "absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-3xl opacity-20",
                    variant === 'orange' && "bg-orange-400",
                    variant === 'pink' && "bg-pink-400",
                    variant === 'purple' && "bg-purple-400",
                    variant === 'blue' && "bg-blue-400",
                    variant === 'green' && "bg-green-400",
                )} />
            )}
        </GlassCard>
    );
}
