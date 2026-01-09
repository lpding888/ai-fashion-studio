'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Plus, Search, Edit2, Trash2, UserCircle2 } from 'lucide-react';
import { UserDialog } from '@/components/admin/user-dialog';
import { BACKEND_ORIGIN } from '@/lib/api';

interface User {
    id: string;
    username: string;
    nickname?: string;
    email?: string;
    role: 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'DISABLED' | 'PENDING';
    credits?: number;
    totalTasks?: number;
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
    const [users, setUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setUsers(data.users || []);
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

            await fetchUsers();
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

            await fetchUsers();
        } catch (err) {
            console.error('Failed to delete user:', err);
        }
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

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

            await fetchUsers();
        } catch (err) {
            console.error('Failed to approve user:', err);
            alert('审核通过失败，请重试');
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
                    <CardDescription>当前共 {users.length} 位用户</CardDescription>
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
                    ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">暂无用户数据</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>用户</TableHead>
                                    <TableHead>角色</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
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
        </div>
    );
}
