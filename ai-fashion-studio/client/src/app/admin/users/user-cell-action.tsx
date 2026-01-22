'use client';

import { useState } from 'react';
import {
    MoreHorizontal,
    Edit2,
    Trash2,
    Coins,
    List,
    Copy,
    ExternalLink,
    CheckCircle
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
import { UserDialog } from '@/components/admin/user-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { BACKEND_ORIGIN } from '@/lib/api';
import { useSWRConfig } from 'swr';
import Link from 'next/link';

// Interface matching page.tsx
export type UserSummary = {
    id: string;
    username: string;
    nickname?: string;
    email?: string;
    role: 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'DISABLED' | 'PENDING';
    credits: number;
    totalTasks: number;
    totalEarned: number;
    totalSpent: number;
    createdAt: number;
    lastLoginAt?: number;
};

type UserFormData = {
    username: string;
    email?: string;
    role: 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'DISABLED' | 'PENDING';
};

type CreditTransaction = {
    id: string;
    createdAt: number | string;
    type: string;
    amount: number;
    balance: number;
    reason?: string;
};

interface UserCellActionProps {
    data: UserSummary;
}

export function UserCellAction({ data }: UserCellActionProps) {
    const { mutate } = useSWRConfig();
    const [loading, setLoading] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);

    // Balance Dialog State
    const [openBalance, setOpenBalance] = useState(false);
    const [balanceValue, setBalanceValue] = useState(data.credits.toString());

    // Transactions Dialog State
    const [openTx, setOpenTx] = useState(false);
    const [txLoading, setTxLoading] = useState(false);
    const [txRows, setTxRows] = useState<CreditTransaction[]>([]);

    const onCopy = (id: string) => {
        navigator.clipboard.writeText(id);
        toast({ title: '已复制用户 ID' });
    };

    // --- Actions ---

    const handleDelete = async () => {
        if (!confirm('确定要删除此用户吗？此操作不可逆。')) return;
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/delete-user/${data.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('删除失败');

            toast({ title: '用户已删除' });
            mutate((key: string) => key.includes('/api/auth/admin/users'));
        } catch {
            toast({ title: '删除失败', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/update-user/${data.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'ACTIVE' }),
            });
            if (!res.ok) throw new Error('审核失败');

            toast({ title: '已通过审核' });
            mutate((key: string) => key.includes('/api/auth/admin/users'));
        } catch {
            toast({ title: '操作失败', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEdit = async (userData: UserFormData) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/update-user/${data.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                username: userData.username,
                email: userData.email || undefined,
                role: userData.role,
                status: userData.status,
            }),
        });

        if (!res.ok) throw new Error('Failed to update user');

        toast({ title: '用户信息已更新' });
        mutate((key: string) => key.includes('/api/auth/admin/users'));
    };

    const handleSetBalance = async () => {
        const target = Number(balanceValue);
        if (!Number.isInteger(target) || target < 0) {
            toast({ title: '请输入非负整数', variant: 'destructive' });
            return;
        }

        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/update-user/${data.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ credits: target }),
            });

            if (!res.ok) throw new Error('设置失败');

            toast({ title: '余额已更新', description: `当前余额: ${target}` });
            setOpenBalance(false);
            mutate((key: string) => key.includes('/api/auth/admin/users'));
        } catch {
            toast({ title: '设置失败', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const loadTransactions = async () => {
        try {
            setTxLoading(true);
            setTxRows([]);
            const token = localStorage.getItem('token');
            const url = new URL(`${BACKEND_ORIGIN}/api/credits/transactions`);
            url.searchParams.set('userId', data.id);
            url.searchParams.set('page', '1');
            url.searchParams.set('limit', '50');

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            setTxRows(Array.isArray(json?.transactions) ? json.transactions : []);
        } catch {
            toast({ title: '加载流水失败', variant: 'destructive' });
        } finally {
            setTxLoading(false);
        }
    };

    return (
        <>
            <div className="flex items-center justify-end gap-2">
                {data.status === 'PENDING' && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={handleApprove}
                        title="通过审核"
                    >
                        <CheckCircle className="h-4 w-4" />
                    </Button>
                )}

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
                        <DropdownMenuItem onClick={() => setOpenEdit(true)}>
                            <Edit2 className="mr-2 h-4 w-4" />
                            编辑资料
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setOpenBalance(true)}>
                            <Coins className="mr-2 h-4 w-4" />
                            设置余额
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                            setOpenTx(true);
                            loadTransactions();
                        }}>
                            <List className="mr-2 h-4 w-4" />
                            查看流水
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={`/admin/tasks?userId=${data.id}`}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                查看任务
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除用户
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Dialogs */}

            <UserDialog
                open={openEdit}
                onOpenChange={setOpenEdit}
                user={{
                    ...data,
                    // Ensure status is valid for UserDialog
                    status: (data.status === 'ACTIVE' || data.status === 'DISABLED' || data.status === 'PENDING') ? data.status : 'ACTIVE'
                }}
                onSave={handleSaveEdit}
            />

            <Dialog open={openBalance} onOpenChange={setOpenBalance}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>设置余额</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>用户</Label>
                            <div className="text-sm font-medium">{data.username}</div>
                            <div className="text-xs text-muted-foreground font-mono">{data.id}</div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="credits">目标积分</Label>
                            <Input
                                id="credits"
                                type="number"
                                min="0"
                                value={balanceValue}
                                onChange={(e) => setBalanceValue(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpenBalance(false)}>取消</Button>
                        <Button onClick={handleSetBalance} disabled={loading}>确认</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={openTx} onOpenChange={setOpenTx}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>积分流水记录</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-[200px] max-h-[400px] overflow-auto">
                        {txLoading ? (
                            <div className="flex justify-center p-8 text-muted-foreground">加载中...</div>
                        ) : txRows.length === 0 ? (
                            <div className="flex justify-center p-8 text-muted-foreground">暂无记录</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>时间</TableHead>
                                        <TableHead>类型</TableHead>
                                        <TableHead>金额</TableHead>
                                        <TableHead>余额</TableHead>
                                        <TableHead>原因</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {txRows.map((tx) => (
                                        <TableRow key={tx.id}>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(tx.createdAt).toLocaleString('zh-CN')}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={tx.type === 'EARN' ? 'default' : 'secondary'} className="text-[10px]">
                                                    {tx.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono">{tx.amount}</TableCell>
                                            <TableCell className="font-mono text-muted-foreground">{tx.balance}</TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate" title={tx.reason}>
                                                {tx.reason}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
