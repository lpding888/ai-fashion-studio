'use client';

import { ColumnDef } from '@tanstack/react-table';
import { CreditCellAction } from './credit-cell-action';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// Define the shape of our data
export type CreditTransaction = {
    id: string;
    userId: string;
    type: 'EARN' | 'SPEND';
    amount: number;
    balance: number;
    reason: string;
    relatedTaskId?: string | null;
    adminId?: string | null;
    createdAt: number;
};

export const columns: ColumnDef<CreditTransaction>[] = [
    {
        accessorKey: 'createdAt',
        header: ({ column }) => (
            <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                className="-ml-4 hover:bg-transparent"
            >
                时间
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(row.original.createdAt).toLocaleString('zh-CN')}</div>,
    },
    {
        accessorKey: 'type',
        header: '类型',
        cell: ({ row }) => (
            <Badge variant={row.original.type === 'EARN' ? 'default' : 'secondary'} className={row.original.type === 'EARN' ? 'bg-green-500 hover:bg-green-600' : ''}>
                {row.original.type}
            </Badge>
        ),
    },
    {
        accessorKey: 'amount',
        header: '金额',
        cell: ({ row }) => (
            <div className={`font-mono font-medium ${row.original.type === 'EARN' ? 'text-green-600' : 'text-red-600'}`}>
                {row.original.type === 'EARN' ? '+' : '-'}{row.original.amount}
            </div>
        ),
    },
    {
        accessorKey: 'balance',
        header: '变动后余额',
        cell: ({ row }) => <div className="font-mono text-muted-foreground">{row.original.balance}</div>,
    },
    {
        accessorKey: 'userId',
        header: '用户',
        cell: ({ row }) => (
            <div className="font-mono text-xs text-muted-foreground truncate w-[80px]" title={row.original.userId}>
                <Link href={`/admin/users?q=${row.original.userId}`} className="hover:underline text-blue-500">
                    {row.original.userId.slice(0, 8)}...
                </Link>
            </div>
        ),
    },
    {
        accessorKey: 'reason',
        header: '原因',
        cell: ({ row }) => <div className="max-w-[200px] truncate text-sm" title={row.original.reason}>{row.original.reason}</div>,
    },
    {
        id: 'actions',
        cell: ({ row }) => <CreditCellAction data={row.original} />,
    },
];
