'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Search,
    Grid3x3,
    List,
    Calendar,
    Eye,
    Trash2,
    Download,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';

interface Task {
    id: string;
    requirements: string;
    status: string;
    shotCount: number;
    createdAt: number;
    resultImages?: string[];
    brainPlan?: any;
}

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'COMPLETED' | 'RENDERING' | 'FAILED' | 'AWAITING_APPROVAL';

export default function HistoryPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const res = await api.get('/tasks');
            setTasks(res.data?.tasks || []);
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.requirements.toLowerCase().includes(searchQuery.toLowerCase()) ||
            task.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
        return matchesSearch && matchesStatus;
    }).sort((a, b) => b.createdAt - a.createdAt);

    const getStatusInfo = (status: string) => {
        const statusMap: Record<string, { color: string; label: string; icon: any }> = {
            COMPLETED: { color: 'bg-green-500', label: '已完成', icon: CheckCircle2 },
            RENDERING: { color: 'bg-blue-500', label: '生成中', icon: Loader2 },
            PLANNING: { color: 'bg-yellow-500', label: '规划中', icon: Clock },
            AWAITING_APPROVAL: { color: 'bg-orange-500', label: '待审批', icon: Clock },
            HERO_RENDERING: { color: 'bg-blue-500', label: 'Hero生成中', icon: Loader2 },
            AWAITING_HERO_APPROVAL: { color: 'bg-orange-500', label: '待确认Hero', icon: Clock },
            STORYBOARD_PLANNING: { color: 'bg-yellow-500', label: '分镜规划中', icon: Clock },
            STORYBOARD_READY: { color: 'bg-green-500', label: '分镜已就绪', icon: CheckCircle2 },
            FAILED: { color: 'bg-red-500', label: '失败', icon: XCircle },
        };
        return statusMap[status] || { color: 'bg-gray-500', label: status, icon: Clock };
    };

    const toggleTaskSelection = (taskId: string) => {
        const newSet = new Set(selectedTasks);
        if (newSet.has(taskId)) {
            newSet.delete(taskId);
        } else {
            newSet.add(taskId);
        }
        setSelectedTasks(newSet);
    };

    const handleBatchDelete = () => {
        if (selectedTasks.size === 0) return;
        if (!confirm(`确定要删除选中的 ${selectedTasks.size} 个任务吗？`)) return;
        // TODO: Implement batch delete API call
        console.log('Delete tasks:', Array.from(selectedTasks));
        setSelectedTasks(new Set());
    };

    return (
        <div className="container py-8 max-w-screen-2xl min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 mb-2">
                    历史记录
                </h1>
                <p className="text-slate-500">
                    查看您的所有创作历程
                </p>
            </div>

            {/* Filters & Actions */}
            <Card className="mb-6 shadow-sm border-slate-200">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="搜索任务需求或ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-10"
                            />
                        </div>

                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                            <SelectTrigger className="w-full md:w-[180px] h-10">
                                <SelectValue placeholder="状态筛选" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="COMPLETED">已完成</SelectItem>
                                <SelectItem value="RENDERING">生成中</SelectItem>
                                <SelectItem value="AWAITING_APPROVAL">待审批</SelectItem>
                                <SelectItem value="FAILED">失败</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* View Mode Toggle */}
                        <div className="flex gap-2">
                            <Button
                                variant={viewMode === 'grid' ? 'default' : 'outline'}
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className="h-10 w-10"
                            >
                                <Grid3x3 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'list' ? 'default' : 'outline'}
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className="h-10 w-10"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Batch Actions */}
                        {selectedTasks.size > 0 && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleBatchDelete}
                                className="h-10"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除 ({selectedTasks.size})
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Results Count */}
            <div className="mb-4 text-sm text-slate-500">
                找到 {filteredTasks.length} 个任务
            </div>

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                        <p className="text-slate-500">加载中...</p>
                    </div>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="text-center py-20">
                    <div className="text-slate-400 mb-2">
                        {searchQuery || statusFilter !== 'all' ? '未找到匹配的任务' : '暂无历史任务'}
                    </div>
                    <Link href="/">
                        <Button variant="outline" className="mt-4">
                            创建第一个任务
                        </Button>
                    </Link>
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    {viewMode === 'grid' ? (
                        <motion.div
                            key="grid"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {filteredTasks.map((task, index) => {
                                const statusInfo = getStatusInfo(task.status);
                                const StatusIcon = statusInfo.icon;
                                const isSelected = selectedTasks.has(task.id);

                                return (
                                    <motion.div
                                        key={task.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                    >
                                        <Card
                                            className={`group hover:shadow-lg transition-all duration-300 cursor-pointer border-2 ${isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-transparent hover:border-slate-200'
                                                }`}
                                            onClick={() => toggleTaskSelection(task.id)}
                                        >
                                            <CardContent className="p-0">
                                                {/* Image Preview */}
                                                <div className="relative h-48 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden rounded-t-lg">
                                                    {task.resultImages && task.resultImages.length > 0 ? (
                                                        <img
                                                            src={task.resultImages[0]}
                                                            alt="Task result"
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full text-slate-400">
                                                            <Calendar className="h-12 w-12" />
                                                        </div>
                                                    )}

                                                    {/* Status Badge */}
                                                    <div className="absolute top-3 right-3">
                                                        <Badge className={`${statusInfo.color} text-white border-0 shadow-md backdrop-blur-sm bg-opacity-90`}>
                                                            <StatusIcon className="h-3 w-3 mr-1" />
                                                            {statusInfo.label}
                                                        </Badge>
                                                    </div>

                                                    {/* Selection Indicator */}
                                                    {isSelected && (
                                                        <div className="absolute top-3 left-3">
                                                            <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                                                                <CheckCircle2 className="h-4 w-4 text-white" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="p-4">
                                                    <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">
                                                        {task.requirements}
                                                    </p>

                                                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                                                        <span className="mx-1">·</span>
                                                        <span>{task.shotCount} 张</span>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="flex-1"
                                                            asChild
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Link href={`/tasks/${task.id}`}>
                                                                <Eye className="h-3 w-3 mr-1" />
                                                                查看
                                                            </Link>
                                                        </Button>
                                                        {task.status === 'COMPLETED' && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    // TODO: Download
                                                                }}
                                                            >
                                                                <Download className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-3"
                        >
                            {filteredTasks.map((task) => {
                                const statusInfo = getStatusInfo(task.status);
                                const StatusIcon = statusInfo.icon;
                                const isSelected = selectedTasks.has(task.id);

                                return (
                                    <Card
                                        key={task.id}
                                        className={`group hover:shadow-md transition-all cursor-pointer border-2 ${isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-transparent hover:border-slate-200'
                                            }`}
                                        onClick={() => toggleTaskSelection(task.id)}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-4">
                                                {/* Selection */}
                                                <div className="flex-shrink-0">
                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-300'
                                                        }`}>
                                                        {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                                                    </div>
                                                </div>

                                                {/* Thumbnail */}
                                                <div className="w-16 h-16 flex-shrink-0 rounded bg-slate-100 overflow-hidden">
                                                    {task.resultImages?.[0] ? (
                                                        <img src={task.resultImages[0]} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                            <Calendar className="h-6 w-6" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-slate-900 truncate">{task.requirements}</p>
                                                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(task.createdAt).toLocaleString('zh-CN')}
                                                        <span className="mx-1">·</span>
                                                        <span>{task.shotCount} 张</span>
                                                    </div>
                                                </div>

                                                {/* Status */}
                                                <Badge className={`${statusInfo.color} text-white border-0`}>
                                                    <StatusIcon className="h-3 w-3 mr-1" />
                                                    {statusInfo.label}
                                                </Badge>

                                                {/* Actions */}
                                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="outline" size="sm" asChild>
                                                        <Link href={`/tasks/${task.id}`}>
                                                            <Eye className="h-3 w-3 mr-1" />
                                                            查看
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    );
}
