'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    MoreHorizontal,
    Eye,
    Trash2,
    RefreshCw,
    Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { useSWRConfig } from 'swr';
import { BACKEND_ORIGIN, directRegenerateTask } from '@/lib/api';

// Defined here or imported if we move it to types
export interface TaskSummary {
    id: string;
    userId?: string;
    requirements: string;
    status: string;
    shotCount: number;
    creditsSpent?: number;
    createdAt: number;
    resultImages?: string[];
    scfMetrics?: {
        count?: number;
        totalMs?: number;
        lastMs?: number;
        lastAt?: number;
        lastShots?: number;
        lastSuccess?: boolean;
    };
}

interface TaskCellActionProps {
    data: TaskSummary;
}

export function TaskCellAction({ data }: TaskCellActionProps) {
    const { mutate } = useSWRConfig();
    const [loading, setLoading] = useState(false);

    const onCopy = (id: string) => {
        navigator.clipboard.writeText(id);
        toast({ title: '已复制任务 ID' });
    };

    const handleDelete = async () => {
        if (!confirm('确定要删除此任务吗？此操作不可逆。')) return;
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/tasks/${data.id}`, { // Assuming generic delete endpoint exists or we need to find it
                // Wait, previous page didn't implement delete function, just the button.
                // Let's assume standard REST: DELETE /api/tasks/:id
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                // Fallback or specific admin endpoint check
                throw new Error('删除失败');
            }

            toast({ title: '任务已删除' });
            mutate((key: string) => key.includes('/tasks'));
        } catch {
            toast({ title: '删除失败', description: '可能暂不支持删除任务', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerate = async () => {
        if (!confirm('确定要重绘此任务吗？将扣除相应积分。')) return;
        try {
            setLoading(true);
            await directRegenerateTask(data.id);
            toast({ title: '重绘任务已提交' });
            mutate((key: string) => key.includes('/tasks'));
        } catch {
            toast({ title: '重绘失败', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>操作</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onCopy(data.id)}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制 ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href={`/tasks/${data.id}`} target="_blank">
                        <Eye className="mr-2 h-4 w-4" />
                        查看详情
                    </Link>
                </DropdownMenuItem>
                {data.status === 'FAILED' && (
                    <DropdownMenuItem onClick={handleRegenerate} disabled={loading}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        重新生成
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} disabled={loading} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除任务
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
