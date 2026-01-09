'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Search, Eye, Trash2, Download } from 'lucide-react';
import api from '@/lib/api';

interface Task {
    id: string;
    requirements: string;
    status: string;
    shotCount: number;
    createdAt: number;
    resultImages?: string[];
}

export default function AdminTasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [loading, setLoading] = useState(true);

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

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = t.requirements.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string) => {
        const variants: Record<string, { variant: any; label: string }> = {
            COMPLETED: { variant: 'default', label: '已完成' },
            RENDERING: { variant: 'secondary', label: '生成中' },
            PLANNING: { variant: 'secondary', label: '规划中' },
            AWAITING_APPROVAL: { variant: 'outline', label: '待审批' },
            FAILED: { variant: 'destructive', label: '失败' },
        };
        const info = variants[status] || { variant: 'outline', label: status };
        return <Badge variant={info.variant}>{info.label}</Badge>;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">任务管理</h2>
                    <p className="text-muted-foreground">查看并管理所有生成任务</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>任务列表</CardTitle>
                    <CardDescription>当前共 {tasks.length} 个任务</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="搜索任务ID或需求..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
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
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">加载中...</div>
                    ) : filteredTasks.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">暂无任务数据</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>任务ID</TableHead>
                                    <TableHead>需求描述</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>镜头数</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map((task) => (
                                    <TableRow key={task.id}>
                                        <TableCell className="font-mono text-xs">
                                            {task.id.substring(0, 8)}...
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate">
                                            {task.requirements}
                                        </TableCell>
                                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                                        <TableCell>{task.shotCount}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(task.createdAt).toLocaleString('zh-CN')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" asChild>
                                                    <Link href={`/tasks/${task.id}`}>
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                                <Button variant="ghost" size="icon">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
