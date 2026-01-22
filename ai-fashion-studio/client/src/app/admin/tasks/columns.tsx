'use client';

import { ColumnDef } from '@tanstack/react-table';
import { TaskSummary, TaskCellAction } from './task-cell-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';
import Link from 'next/link';

// Using the logic from previous page for badges
const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
        COMPLETED: { variant: 'default', label: '已完成' },
        RENDERING: { variant: 'secondary', label: '生成中' },
        PLANNING: { variant: 'secondary', label: '规划中' },
        AWAITING_APPROVAL: { variant: 'outline', label: '待审批' },
        HERO_RENDERING: { variant: 'secondary', label: 'Hero生成中' },
        AWAITING_HERO_APPROVAL: { variant: 'outline', label: '待确认Hero' },
        STORYBOARD_PLANNING: { variant: 'secondary', label: '分镜规划中' },
        STORYBOARD_READY: { variant: 'default', label: '分镜已就绪' },
        FAILED: { variant: 'destructive', label: '失败' },
    };
    const info = variants[status] || { variant: 'outline', label: status };
    return <Badge variant={info.variant}>{info.label}</Badge>;
};

const formatMs = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    const ms = value;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const formatScfMetrics = (metrics?: TaskSummary['scfMetrics']) => {
    if (!metrics || typeof metrics.lastMs !== 'number') return '-';
    const last = formatMs(metrics.lastMs);
    const count = typeof metrics.count === 'number' ? metrics.count : undefined;
    return count ? `${last} / ${count}` : last;
};

export const columns: ColumnDef<TaskSummary>[] = [
    {
        accessorKey: 'id',
        header: '任务 ID',
        cell: ({ row }) => (
            <div className="font-mono text-xs text-muted-foreground truncate w-[80px]" title={row.getValue('id')}>
                {row.getValue('id')}
            </div>
        ),
    },
    {
        accessorKey: 'userId',
        header: '用户 ID',
        cell: ({ row }) => (
            <div className="font-mono text-xs text-muted-foreground truncate w-[80px]" title={row.original.userId}>
                {row.original.userId ? (
                    <Link href={`/admin/users?q=${row.original.userId}`} className="hover:underline">
                        {row.original.userId}
                    </Link>
                ) : '-'}
            </div>
        ),
    },
    {
        accessorKey: 'requirements',
        header: '需求描述',
        cell: ({ row }) => (
            <div className="max-w-[300px] truncate text-sm" title={row.original.requirements}>
                {row.original.requirements}
            </div>
        ),
    },
    {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
        accessorKey: 'creditsSpent',
        header: ({ column }) => (
            <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                className="-ml-4 hover:bg-transparent"
            >
                扣费
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => <div className="text-muted-foreground">{row.original.creditsSpent ?? '-'}</div>,
    },
    {
        accessorKey: 'shotCount',
        header: '镜头',
        cell: ({ row }) => <div className="text-center">{row.original.shotCount}</div>,
    },
    {
        accessorKey: 'scfMetrics',
        header: 'SCF耗时',
        cell: ({ row }) => <div className="text-xs text-muted-foreground">{formatScfMetrics(row.original.scfMetrics)}</div>,
    },
    {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ row }) => (
            <div className="text-xs text-muted-foreground">
                {new Date(row.original.createdAt).toLocaleString('zh-CN')}
            </div>
        ),
    },
    {
        id: 'actions',
        cell: ({ row }) => <TaskCellAction data={row.original} />,
    },
];
