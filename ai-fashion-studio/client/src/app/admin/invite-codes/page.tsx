'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Plus, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/admin/shared/page-header';
import { InviteTable, InviteCode } from './invite-table';

const fetcher = (url: string) => api.get(url).then(res => res.data?.invites || []);

export default function AdminInviteCodesPage() {
    const { data: invites = [], error, isLoading, mutate } = useSWR<InviteCode[]>('/auth/admin/invite-codes', fetcher);

    const [creating, setCreating] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [latestCode, setLatestCode] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

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
            mutate();
        } catch (e: unknown) {
            console.error('Failed to create invite code', e);
            alert('生成邀请码失败');
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (e) {
            console.error('Failed to copy', e);
            alert('复制失败，请手动复制');
        }
    };

    const handleRevoke = async (inviteId: string) => {
        if (!confirm('确定要撤销此邀请码吗？')) return;
        try {
            setRevokingId(inviteId);
            await api.delete(`/auth/admin/invite-codes/${inviteId}`);
            mutate();
        } catch (e: unknown) {
            console.error('Failed to revoke invite code', e);
            alert('撤销失败');
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="邀请码管理"
                    description="生成一次性邀请码用于内测注册（明文仅创建时返回一次）。"
                />
                <Button variant="outline" onClick={() => mutate()} disabled={isLoading} className="gap-2">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新
                </Button>
            </div>

            {error && (
                <div className="p-4 rounded-md bg-red-50 text-red-600 border border-red-200">
                    加载失败：{error.message || '未知错误'}
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>邀请码列表</CardTitle>
                        <CardDescription>
                            总数: {stats.total} | 可用: <span className="text-emerald-600 font-bold">{stats.available}</span> | 已用: {stats.used} | 已撤销: {stats.revoked}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <InviteTable
                            invites={invites}
                            loading={isLoading}
                            revokingId={revokingId}
                            onRevoke={handleRevoke}
                        />
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>生成邀请码</CardTitle>
                            <CardDescription>创建新的注册凭证</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    placeholder="备注（可选，例如：给XX内测）"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                                <Button onClick={handleCreate} disabled={creating} className="w-full">
                                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                    {creating ? '生成中...' : '立即生成'}
                                </Button>
                            </div>

                            {latestCode && (
                                <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 animate-in zoom-in-95 duration-200">
                                    <div className="text-xs font-medium text-emerald-800">
                                        🎉 生成成功（请立即复制）{copySuccess && ' · ✅ 已复制'}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input value={latestCode} readOnly className="font-mono text-emerald-900 bg-white" />
                                        <Button variant="outline" size="icon" onClick={() => handleCopy(latestCode)} className="shrink-0 text-emerald-700 border-emerald-300 hover:bg-emerald-100">
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
