'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface User {
    id?: string;
    username: string;
    email?: string;
    role: 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'DISABLED' | 'PENDING';
}

interface UserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user?: User | null;
    onSave: (user: User) => Promise<void>;
}

export function UserDialog({ open, onOpenChange, user, onSave }: UserDialogProps) {
    const [formData, setFormData] = useState<User>(user || {
        username: '',
        email: '',
        role: 'USER',
        status: 'ACTIVE'
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData(user || {
            username: '',
            email: '',
            role: 'USER',
            status: 'ACTIVE'
        });
    }, [user, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to save user:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{user ? '编辑用户' : '创建用户'}</DialogTitle>
                        <DialogDescription>
                            {user ? '修改用户信息' : '添加新的系统用户'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="username">用户名</Label>
                            <Input
                                id="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                required
                                placeholder="请输入用户名"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="email">邮箱</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="user@example.com"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="role">角色</Label>
                            <Select value={formData.role} onValueChange={(value: 'ADMIN' | 'USER') => setFormData({ ...formData, role: value })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USER">普通用户</SelectItem>
                                    <SelectItem value="ADMIN">管理员</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="status">状态</Label>
                            <Select value={formData.status} onValueChange={(value: 'ACTIVE' | 'DISABLED' | 'PENDING') => setFormData({ ...formData, status: value })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ACTIVE">活跃</SelectItem>
                                    <SelectItem value="PENDING">待审核</SelectItem>
                                    <SelectItem value="DISABLED">停用</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? '保存中...' : '保存'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
