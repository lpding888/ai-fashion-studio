'use client';

import { ColumnDef } from '@tanstack/react-table';
import { UserSummary, UserCellAction } from './user-cell-action';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';

export const columns: ColumnDef<UserSummary>[] = [
    {
        accessorKey: 'id',
        header: '用户 ID',
        cell: ({ row }) => (
            <div className="font-mono text-xs text-muted-foreground truncate w-[80px]" title={row.getValue('id')}>
                {row.getValue('id')}
            </div>
        ),
    },
    {
        accessorKey: 'username',
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 hover:bg-transparent"
                >
                    用户
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            );
        },
        cell: ({ row }) => {
            const user = row.original;
            return (
                <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-white/20">
                        <AvatarImage src={user.email ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}` : ''} />
                        <AvatarFallback className="bg-orange-100 text-orange-600 text-xs font-bold">
                            {(user.username || 'U').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="font-medium text-sm">{user.username}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                </div>
            );
        },
    },
    {
        accessorKey: 'role',
        header: '角色',
        cell: ({ row }) => <Badge variant={row.original.role === 'ADMIN' ? 'default' : 'secondary'}>{row.original.role}</Badge>,
    },
    {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => (
            <Badge
                variant={row.original.status === 'ACTIVE' ? 'outline' : row.original.status === 'PENDING' ? 'secondary' : 'destructive'}
                className={row.original.status === 'ACTIVE' ? 'border-green-200 text-green-700 bg-green-50' : ''}
            >
                {row.original.status}
            </Badge>
        ),
    },
    {
        accessorKey: 'credits',
        header: ({ column }) => (
            <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                className="-ml-4 hover:bg-transparent"
            >
                余额
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => <div className="font-mono font-medium">{row.original.credits}</div>,
    },
    {
        accessorKey: 'totalTasks',
        header: '任务数',
        cell: ({ row }) => <div className="text-muted-foreground text-sm">{row.original.totalTasks}</div>,
    },
    {
        accessorKey: 'createdAt',
        header: '注册时间',
        cell: ({ row }) => (
            <div className="text-xs text-muted-foreground">
                {new Date(row.original.createdAt).toLocaleDateString('zh-CN')}
            </div>
        ),
    },
    {
        id: 'actions',
        cell: ({ row }) => <UserCellAction data={row.original} />,
    },
];
