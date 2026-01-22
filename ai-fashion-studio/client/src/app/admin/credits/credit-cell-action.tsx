'use client';

import {
    MoreHorizontal,
    Copy,
    User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import Link from 'next/link';

interface CreditTransaction {
    id: string;
    userId: string;
    type: 'EARN' | 'SPEND';
    amount: number;
    balance: number;
    reason: string;
    relatedTaskId?: string | null;
    adminId?: string | null;
    createdAt: number;
}

interface CreditCellActionProps {
    data: CreditTransaction;
}

export function CreditCellAction({ data }: CreditCellActionProps) {
    const onCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: `已复制 ${label}` });
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
                <DropdownMenuItem onClick={() => onCopy(data.id, '流水 ID')}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制流水 ID
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopy(data.userId, '用户 ID')}>
                    <User className="mr-2 h-4 w-4" />
                    复制用户 ID
                </DropdownMenuItem>
                {data.relatedTaskId && (
                    <DropdownMenuItem asChild>
                        <Link href={`/admin/tasks?q=${data.relatedTaskId}`}>
                            <Copy className="mr-2 h-4 w-4" />
                            关联任务
                        </Link>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
