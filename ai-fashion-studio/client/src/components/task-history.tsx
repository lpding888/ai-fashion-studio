"use client";

import * as React from 'react';
import Link from 'next/link';
// Removed date-fns imports to avoid installation issues
import { Loader2, Calendar, Clock, ArrowRight, Image as ImageIcon, CheckCircle2, AlertCircle, Brain, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import api, { BACKEND_ORIGIN } from '@/lib/api';

interface TaskHistoryItem {
    id: string;
    status: string;
    createdAt: number;
    requirements?: string;
    heroImageUrl?: string;
    gridImageUrl?: string;
    heroShots?: Array<{
        index: number;
        status?: string;
        imageUrl?: string;
        selectedAttemptCreatedAt?: number;
        attempts?: Array<{ createdAt: number; outputImageUrl?: string }>;
    }>;
    resultImages?: string[];
    brainPlan?: {
        shots?: Array<{
            imagePath?: string;
            status?: string;
        }>
    };
    shots?: Array<{
        imagePath?: string;
    }>;
}

interface TaskListResponse {
    tasks: TaskHistoryItem[];
    total: number;
    page: number;
    totalPages: number;
}

// Simple time formatter without dependencies
function formatTimeAgo(timestamp: number) {
    const now = Date.now();
    const diff = now - timestamp;

    // Less than a minute
    if (diff < 60 * 1000) return '刚刚';

    // Minutes
    const minutes = Math.floor(diff / (60 * 1000));
    if (minutes < 60) return `${minutes}分钟前`;

    // Hours
    const hours = Math.floor(diff / (60 * 60 * 1000));
    if (hours < 24) return `${hours}小时前`;

    // Days
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days < 7) return `${days}天前`;

    // Full date for older items
    return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function TaskHistory() {
    const [loading, setLoading] = React.useState(true);
    const [tasks, setTasks] = React.useState<TaskHistoryItem[]>([]);
    const [error, setError] = React.useState<string | null>(null);

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const res = await api.get<TaskListResponse>('/tasks', { params: { limit: 10 } });
            setTasks(res.data?.tasks || []);
        } catch (err) {
            console.error("Failed to fetch tasks", err);
            setError("无法加载历史记录");
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchTasks();
    }, []);

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'COMPLETED': return { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: '已完成' };
            case 'FAILED': return { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: '失败' };
            case 'RENDERING': return { color: 'bg-purple-100 text-purple-700', icon: Sparkles, label: '渲染中' };
            case 'PLANNING': return { color: 'bg-blue-100 text-blue-700', icon: Brain, label: '策划中' };
            case 'AWAITING_APPROVAL': return { color: 'bg-amber-100 text-amber-700', icon: Clock, label: '待确认' };
            case 'HERO_RENDERING': return { color: 'bg-purple-100 text-purple-700', icon: Sparkles, label: '母版生成中' };
            case 'AWAITING_HERO_APPROVAL': return { color: 'bg-amber-100 text-amber-700', icon: Clock, label: '待确认Hero' };
            case 'STORYBOARD_PLANNING': return { color: 'bg-blue-100 text-blue-700', icon: Brain, label: '分镜规划中' };
            case 'STORYBOARD_READY': return { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: '分镜已就绪' };
            case 'SHOTS_RENDERING': return { color: 'bg-purple-100 text-purple-700', icon: Sparkles, label: '镜头生成中' };
            default: return { color: 'bg-slate-100 text-slate-700', icon: Clock, label: status };
        }
    };

    const pickHeroShotPreview = (shots: TaskHistoryItem['heroShots']) => {
        const first = (shots || []).sort((a, b) => (a?.index || 0) - (b?.index || 0))[0];
        if (!first) return undefined;

        if (first.selectedAttemptCreatedAt) {
            const selected = (first.attempts || []).find((a) => a.createdAt === first.selectedAttemptCreatedAt && !!a.outputImageUrl);
            if (selected?.outputImageUrl) return selected.outputImageUrl;
        }

        if (first.imageUrl) return first.imageUrl;
        const latest = (first.attempts || []).filter((a) => !!a.outputImageUrl).sort((a, b) => b.createdAt - a.createdAt)[0];
        return latest?.outputImageUrl;
    };

    const toImgSrc = (pathOrUrl: string) => {
        if (!pathOrUrl) return '';
        if (pathOrUrl.startsWith('http')) return pathOrUrl;
        return `${BACKEND_ORIGIN}/${String(pathOrUrl).replace(/^\/+/, '')}`;
    };

    if (loading) {
        return (
            <div className="w-full flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!loading && tasks.length === 0) {
        return null; // Don't show if empty
    }

    return (
        <section className="w-full max-w-5xl mx-auto mt-16 mb-12">
            <div className="flex items-center justify-between mb-6 px-4">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-500" />
                    创作历史
                </h2>
                {/* Future: Add View All link */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4">
                {tasks.map((task, idx) => {
                    const statusConfig = getStatusConfig(task.status);
                    const StatusIcon = statusConfig.icon;

                    // Find a thumbnail if available
                    // Priority: Hero > Grid > HeroShot > resultImages > legacy shots
                    const thumbnail =
                        task.heroImageUrl ||
                        task.gridImageUrl ||
                        pickHeroShotPreview(task.heroShots) ||
                        task.resultImages?.[0] ||
                        task.shots?.find((s) => s.imagePath)?.imagePath ||
                        null;

                    return (
                        <motion.div
                            key={task.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                        >
                            <Link href={`/tasks/${task.id}`}>
                                <Card className="overflow-hidden hover:shadow-md transition-shadow border-slate-200 group cursor-pointer h-full flex flex-col">
                                    <div className="aspect-[3/2] bg-slate-100 relative overflow-hidden">
                                        {thumbnail ? (
                                            <img
                                                src={toImgSrc(thumbnail)}
                                                alt="Task Thumbnail"
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                                                <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                                                <span className="text-xs font-medium">无预览图</span>
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2">
                                            <Badge className={`${statusConfig.color} border-0 shadow-sm backdrop-blur-sm`}>
                                                <StatusIcon className="w-3 h-3 mr-1" />
                                                {statusConfig.label}
                                            </Badge>
                                        </div>
                                    </div>
                                    <CardContent className="p-4 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {formatTimeAgo(task.createdAt)}
                                            </div>
                                            <p className="text-sm text-slate-700 font-medium line-clamp-2 mb-3">
                                                {task.requirements ? task.requirements : "无需求描述"}
                                            </p>
                                        </div>
                                        <div className="flex items-center text-xs text-purple-600 font-medium group-hover:translate-x-1 transition-transform">
                                            查看详情 <ArrowRight className="w-3 h-3 ml-1" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        </motion.div>
                    );
                })}
            </div>
        </section>
    );
}
