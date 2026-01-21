'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Copy, Plus, Trash2 } from 'lucide-react';

type InviteCode = {
    id: string;
    createdAt: number;
    createdByUserId?: string;
    usedAt?: number;
    usedByUserId?: string;
    revokedAt?: number;
    note?: string;
};

const getErrorMessage = (error: unknown, fallback: string) => {
    const maybe = error as { response?: { data?: { message?: string } }; message?: string };
    return maybe?.response?.data?.message || (error instanceof Error ? error.message : fallback);
};

export default function AdminInviteCodesPage() {
    const [invites, setInvites] = useState<InviteCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [latestCode, setLatestCode] = useState<string | null>(null);

    const fetchInvites = async () => {
        try {
            setLoading(true);
            const res = await api.get('/auth/admin/invite-codes');
            setInvites(res.data?.invites || []);
        } catch (e) {
            console.error('Failed to fetch invite codes', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvites();
    }, []);

    const stats = useMemo(() => {
        const total = invites.length;
        const used = invites.filter((i) => !!i.usedAt || !!i.usedByUserId).length;
        const revoked = invites.filter((i) => !!i.revokedAt).length;
        const available = total - used - revoked;
        return { total, used, revoked, available };
    }, [invites]);

    const handleCreate = async () => {
        try {
            setCreating(true);
            setLatestCode(null);
            const res = await api.post('/auth/admin/invite-codes', { note: note || undefined });
            setLatestCode(res.data?.code || null);
            setNote('');
            await fetchInvites();
        } catch (e: unknown) {
            console.error('Failed to create invite code', e);
            alert(getErrorMessage(e, '生成邀请码失败'));
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            console.error('Failed to copy', e);
        }
    };

    const handleRevoke = async (inviteId: string) => {
        if (!confirm('确定要撤销此邀请码吗？')) return;
        try {
            setRevokingId(inviteId);
            await api.delete(`/auth/admin/invite-codes/${inviteId}`);
            await fetchInvites();
        } catch (e: unknown) {
            console.error('Failed to revoke invite code', e);
            alert(getErrorMessage(e, '撤销失败'));
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>邀请码</CardTitle>
                    <CardDescription>生成一次性邀请码用于内测注册（明文仅创建时返回一次）</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Input
                            placeholder="备注（可选）"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="sm:max-w-sm"
                        />
                        <Button onClick={handleCreate} disabled={creating} className="sm:w-auto">
                            <Plus className="h-4 w-4 mr-2" />
                            {creating ? '生成中...' : '生成邀请码'}
                        </Button>
                    </div>

                    {latestCode && (
                        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/30">
                            <div className="text-sm font-medium">最新邀请码（请立即复制保存）</div>
                            <div className="flex gap-2">
                                <Input value={latestCode} readOnly />
                                <Button variant="outline" size="icon" onClick={() => handleCopy(latestCode)}>
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>总数: {stats.total}</span>
                        <span>可用: {stats.available}</span>
                        <span>已用: {stats.used}</span>
                        <span>已撤销: {stats.revoked}</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>列表</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-10 text-center text-muted-foreground">加载中...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>状态</TableHead>
                                    <TableHead>备注</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>使用情况</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invites.map((i) => {
                                    const isUsed = !!i.usedAt || !!i.usedByUserId;
                                    const isRevoked = !!i.revokedAt;
                                    const status = isRevoked ? '已撤销' : isUsed ? '已使用' : '可用';
                                    return (
                                        <TableRow key={i.id}>
                                            <TableCell>
                                                <Badge variant={isRevoked ? 'outline' : isUsed ? 'secondary' : 'default'}>
                                                    {status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{i.note || '-'}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(i.createdAt).toLocaleString('zh-CN')}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {isUsed ? (
                                                    <div className="space-y-1">
                                                        <div>用户: {i.usedByUserId || '-'}</div>
                                                        <div>时间: {i.usedAt ? new Date(i.usedAt).toLocaleString('zh-CN') : '-'}</div>
                                                    </div>
                                                ) : (
                                                    '-'
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={isUsed || isRevoked || revokingId === i.id}
                                                    onClick={() => handleRevoke(i.id)}
                                                    title="撤销"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

