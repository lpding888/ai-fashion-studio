'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Plus, Search, Edit2, Trash2, UserCircle2, Copy, Coins, List, ExternalLink } from 'lucide-react';
import { UserDialog } from '@/components/admin/user-dialog';
import { BACKEND_ORIGIN } from '@/lib/api';

interface UserSummary {
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
}

type UserDialogData = {
    id?: string;
    username: string;
    email?: string;
    role: 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'DISABLED' | 'PENDING';
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserSummary | null>(null);

    // paging
    const [page, setPage] = useState(1);
    const limit = 20;
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    // set-balance dialog (credits overwrite)
    const [balanceOpen, setBalanceOpen] = useState(false);
    const [balanceUser, setBalanceUser] = useState<UserSummary | null>(null);
    const [balanceValue, setBalanceValue] = useState<string>('');

    // transactions dialog (recent 50)
    const [txOpen, setTxOpen] = useState(false);
    const [txUser, setTxUser] = useState<UserSummary | null>(null);
    const [txLoading, setTxLoading] = useState(false);
    const [txRows, setTxRows] = useState<Array<{
        id: string;
        type: 'EARN' | 'SPEND';
        amount: number;
        balance: number;
        reason: string;
        relatedTaskId?: string;
        adminId?: string;
        createdAt: number;
    }>>([]);

    useEffect(() => {
        const t = setTimeout(() => {
            fetchUsers(page);
        }, 200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, searchQuery]);

    const fetchUsers = async (pageNum: number) => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const url = new URL(`${BACKEND_ORIGIN}/api/auth/admin/users/summary`);
            url.searchParams.set('page', String(pageNum));
            url.searchParams.set('limit', String(limit));
            if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setUsers(Array.isArray(data.users) ? data.users : []);
            setTotal(Number(data.total || 0));
            setTotalPages(Math.max(1, Number(data.totalPages || 1)));
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveUser = async (userData: UserDialogData) => {
        try {
            const token = localStorage.getItem('token');

            if (editingUser) {
                // 更新现有用户
                const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/update-user/${editingUser.id}`, {
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
            } else {
                // 创建新用户
                const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/create-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        username: userData.username,
                        password: 'temp123456', // 临时密码，管理员应告知用户
                        nickname: userData.username,
                        email: userData.email || undefined,
                        role: userData.role,
                        status: userData.status,
                        credits: 100
                    }),
                });

                if (!res.ok) throw new Error('Failed to create user');
            }

            await fetchUsers(page);
            setEditingUser(null);
        } catch (err) {
            console.error('Failed to save user:', err);
            throw err;
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('确定要删除此用户吗？')) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/delete-user/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to delete user');

            await fetchUsers(page);
        } catch (err) {
            console.error('Failed to delete user:', err);
        }
    };

    const handleApprove = async (userId: string) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/update-user/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'ACTIVE' }),
            });

            if (!res.ok) throw new Error('Failed to approve user');

            await fetchUsers(page);
        } catch (err) {
            console.error('Failed to approve user:', err);
            alert('审核通过失败，请重试');
        }
    };

    const copyUserId = async (id: string) => {
        try {
            await navigator.clipboard.writeText(id);
            toast({ title: '已复制', description: id });
        } catch {
            toast({ title: '复制失败', description: '浏览器不支持剪贴板或权限不足', variant: 'destructive' });
        }
    };

    const openSetBalance = (u: UserSummary) => {
        setBalanceUser(u);
        setBalanceValue(String(u.credits ?? 0));
        setBalanceOpen(true);
    };

    const submitSetBalance = async () => {
        const u = balanceUser;
        if (!u) return;
        const target = Number(balanceValue);
        if (!Number.isInteger(target) || target < 0) {
            toast({ title: '参数错误', description: 'credits 必须为非负整数', variant: 'destructive' });
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/update-user/${u.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ credits: target }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || '设置余额失败');
            }
            toast({ title: '设置成功', description: `用户 ${u.username} 余额已更新为 ${target}` });
            setBalanceOpen(false);
            setBalanceUser(null);
            await fetchUsers(page);
        } catch (e: unknown) {
            toast({
                title: '设置失败',
                description: e instanceof Error ? e.message : '未知错误',
                variant: 'destructive'
            });
        }
    };

    const openTransactions = async (u: UserSummary) => {
        setTxUser(u);
        setTxOpen(true);
        setTxLoading(true);
        setTxRows([]);
        try {
            const token = localStorage.getItem('token');
            const url = new URL(`${BACKEND_ORIGIN}/api/credits/transactions`);
            url.searchParams.set('userId', u.id);
            url.searchParams.set('page', '1');
            url.searchParams.set('limit', '50');
            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setTxRows(Array.isArray(data?.transactions) ? data.transactions : []);
        } catch {
            toast({ title: '加载失败', description: '获取积分流水失败', variant: 'destructive' });
        } finally {
            setTxLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">用户管理</h2>
                    <p className="text-muted-foreground">管理系统注册用户和权限</p>
                </div>
                <Button onClick={() => {
                    setEditingUser(null);
                    setDialogOpen(true);
                }}>
                    <Plus className="h-4 w-4 mr-2" />
                    添加用户
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>用户列表</CardTitle>
                    <CardDescription>当前共 {total} 位用户</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="搜索用户名或邮箱..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">加载中...</div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">暂无用户数据</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[220px]">用户ID</TableHead>
                                    <TableHead>用户</TableHead>
                                    <TableHead>角色</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>余额</TableHead>
                                    <TableHead>累计</TableHead>
                                    <TableHead>任务数</TableHead>
                                    <TableHead>最近登录</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-mono text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">{user.id}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => void copyUserId(user.id)}
                                                    title="复制用户ID"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                                    <UserCircle2 className="h-6 w-6 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <div className="font-medium">{user.username}</div>
                                                    <div className="text-sm text-muted-foreground">{user.email || '-'}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                                                {user.role === 'ADMIN' ? '管理员' : '用户'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    user.status === 'ACTIVE'
                                                        ? 'default'
                                                        : user.status === 'PENDING'
                                                            ? 'secondary'
                                                            : 'outline'
                                                }
                                            >
                                                {user.status === 'ACTIVE' ? '活跃' : user.status === 'PENDING' ? '待审核' : '停用'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {user.credits}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            <div>E+ {user.totalEarned}</div>
                                            <div>S- {user.totalSpent}</div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{user.totalTasks}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '-'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {user.status === 'PENDING' && (
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        onClick={() => handleApprove(user.id)}
                                                    >
                                                        通过
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openSetBalance(user)}
                                                    title="设置余额"
                                                >
                                                    <Coins className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => void openTransactions(user)}
                                                    title="查看最近流水（50条）"
                                                >
                                                    <List className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" asChild title="查看该用户任务">
                                                    <Link href={`/admin/tasks?userId=${user.id}`}>
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setEditingUser(user);
                                                        setDialogOpen(true);
                                                    }}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteUser(user.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            第 {page}/{totalPages} 页
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                                上一页
                            </Button>
                            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                                下一页
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <UserDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                user={editingUser ? {
                    id: editingUser.id,
                    username: editingUser.username,
                    email: editingUser.email || '',
                    role: editingUser.role,
                    status: editingUser.status
                } : null}
                onSave={handleSaveUser}
            />

            <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>设置余额</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <div>用户：<span className="font-medium text-foreground">{balanceUser?.username || '-'}</span></div>
                        <div className="font-mono text-xs">{balanceUser?.id || ''}</div>
                    </div>
                    <div className="grid gap-2 mt-4">
                        <Label htmlFor="credits">目标余额（非负整数）</Label>
                        <Input
                            id="credits"
                            type="number"
                            min="0"
                            value={balanceValue}
                            onChange={(e) => setBalanceValue(e.target.value)}
                        />
                        <div className="text-xs text-muted-foreground">说明：不填写 reason，将使用系统默认文案写入流水。</div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBalanceOpen(false)}>取消</Button>
                        <Button onClick={() => void submitSetBalance()} disabled={!balanceUser}>确认</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={txOpen} onOpenChange={setTxOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>最近流水（50条）</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-muted-foreground">
                        用户：<span className="font-medium text-foreground">{txUser?.username || '-'}</span>
                        {txUser ? (
                            <span className="ml-2 font-mono text-xs">{txUser.id}</span>
                        ) : null}
                    </div>
                    {txUser ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                            余额：<span className="font-mono text-foreground">{txUser.credits}</span>；累计 Earned：<span className="font-mono text-foreground">{txUser.totalEarned}</span>；累计 Spent：<span className="font-mono text-foreground">{txUser.totalSpent}</span>
                        </div>
                    ) : null}

                    <div className="mt-4">
                        {txLoading ? (
                            <div className="py-6 text-center text-muted-foreground">加载中...</div>
                        ) : txRows.length === 0 ? (
                            <div className="py-6 text-center text-muted-foreground">暂无流水</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>时间</TableHead>
                                        <TableHead>类型</TableHead>
                                        <TableHead>金额</TableHead>
                                        <TableHead>余额</TableHead>
                                        <TableHead>原因</TableHead>
                                        <TableHead>关联任务</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {txRows.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="text-muted-foreground">{new Date(r.createdAt).toLocaleString('zh-CN')}</TableCell>
                                            <TableCell>
                                                <Badge variant={r.type === 'EARN' ? 'default' : 'secondary'}>{r.type}</Badge>
                                            </TableCell>
                                            <TableCell className="font-mono">{r.amount}</TableCell>
                                            <TableCell className="font-mono text-muted-foreground">{r.balance}</TableCell>
                                            <TableCell className="max-w-[280px] truncate">{r.reason}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{r.relatedTaskId ? r.relatedTaskId.slice(0, 8) : '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTxOpen(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
