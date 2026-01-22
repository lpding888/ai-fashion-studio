'use client';

import * as React from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Plus } from 'lucide-react';
import { PageHeader } from '@/components/admin/shared/page-header';
import { ActiveMap, ActivePoolMap, ModelProfileGroup, ModelProfileKind, ModelProfilePublic, ModelProvider } from './types';
import { ProfileDialog } from './profile-dialog';
import { ProfileTable } from './profile-table';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function AdminModelProfilesPage() {
    // ---- Data Fetching ----
    const { data, error: loadError, mutate, isLoading } = useSWR<{
        active: ActiveMap;
        activePool: ActivePoolMap;
        profiles: ModelProfilePublic[];
    }>('/admin/model-profiles', fetcher);

    // ---- Local State ----
    const [actionLoading, setActionLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<ModelProfilePublic | null>(null);
    const [defaultKind, setDefaultKind] = React.useState<ModelProfileKind>('BRAIN');

    const [testingId, setTestingId] = React.useState<string | null>(null);
    const [testResult, setTestResult] = React.useState<Record<string, { ok: boolean; message: string }>>({});

    const active = data?.active || {};
    const activePool = data?.activePool || {};
    const profiles = React.useMemo(() => data?.profiles ?? [], [data?.profiles]);

    const getErrorMessage = (e: unknown) => {
        if (typeof e === 'object' && e !== null) {
            const response = (e as { response?: { data?: { message?: string } } })?.response;
            const msg = response?.data?.message;
            if (typeof msg === 'string') return msg;
        }
        return e instanceof Error ? e.message : 'Unknown error';
    };

    const handleRefresh = () => {
        mutate();
        setSuccess('已刷新');
        setTimeout(() => setSuccess(null), 2000);
    };

    const openCreate = (kind: ModelProfileKind = 'BRAIN') => {
        setEditing(null);
        setDefaultKind(kind);
        setDialogOpen(true);
    };

    const openEdit = (p: ModelProfilePublic) => {
        setEditing(p);
        setDialogOpen(true);
    };

    const handleSave = async (formData: {
        kind: ModelProfileKind;
        provider: ModelProvider;
        name: string;
        gateway: string;
        model: string;
        apiKey: string;
        disabled: boolean;
    }) => {
        setError(null);
        setSuccess(null);
        setActionLoading(true);
        try {
            if (!formData.name.trim()) throw new Error('名称不能为空');
            if (!formData.gateway.trim()) throw new Error('网关不能为空');
            if (!formData.model.trim()) throw new Error('模型不能为空');

            if (editing) {
                const body: {
                    provider: ModelProvider;
                    name: string;
                    gateway: string;
                    model: string;
                    disabled: boolean;
                    apiKey?: string;
                } = {
                    provider: formData.provider,
                    name: formData.name.trim(),
                    gateway: formData.gateway.trim(),
                    model: formData.model.trim(),
                    disabled: formData.disabled,
                };
                if (formData.apiKey.trim()) body.apiKey = formData.apiKey.trim();

                await api.patch(`/admin/model-profiles/${editing.id}`, body);
                setSuccess('已更新配置');
            } else {
                if (!formData.apiKey.trim()) throw new Error('密钥不能为空');
                await api.post('/admin/model-profiles', {
                    kind: formData.kind,
                    provider: formData.provider,
                    name: formData.name.trim(),
                    gateway: formData.gateway.trim(),
                    model: formData.model.trim(),
                    apiKey: formData.apiKey.trim(),
                });
                setSuccess('已创建配置');
            }
            setDialogOpen(false);
            mutate();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setActionLoading(false);
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await api.post(`/admin/model-profiles/${id}/test`);
            setTestResult((prev) => ({ ...prev, [id]: res.data.result }));
        } catch (e: unknown) {
            setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: getErrorMessage(e) } }));
        } finally {
            setTestingId(null);
        }
    };

    const handleSetActive = async (p: ModelProfilePublic) => {
        setError(null);
        setSuccess(null);
        setActionLoading(true);
        try {
            await api.post(
                '/admin/model-profiles/set-active',
                p.kind === 'BRAIN' ? { brainProfileId: p.id } : { painterProfileId: p.id }
            );
            setSuccess(`已设置为当前生效：${p.name}`);
            mutate();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setActionLoading(false);
        }
    };

    const handleTogglePool = async (p: ModelProfilePublic) => {
        const kind = p.kind;
        const currentPool = activePool[kind] || [];
        const currentActive = active[kind];

        // If pool is empty, it logically contains only the active ID, if any.
        const effectivePool = currentPool.length > 0 ? currentPool : (currentActive ? [currentActive] : []);

        // Logic check: ensure we are operating within the same "group" (gateway+model)
        // If user tries to add a key from a DIFFERENT model/gateway to the pool,
        // we should probably switch the ENTIRE pool to that new group (and make this the first item).
        // Or we block it. The old code switched active to p if group diff.

        // Let's implement the "switch if different group" logic for safety.
        // We need to find the group of the CURRENT active profile.
        const currentActiveProfile = profiles.find(x => x.id === (effectivePool[0] || currentActive));

        if (currentActiveProfile) {
            const isSameGroup = (
                p.provider === currentActiveProfile.provider &&
                p.gateway === currentActiveProfile.gateway &&
                p.model === currentActiveProfile.model
            );
            if (!isSameGroup) {
                // Different group -> Set as active (clears pool of other group)
                await handleSetActive(p);
                return;
            }
        }

        const has = effectivePool.includes(p.id);
        const next = has ? effectivePool.filter((id) => id !== p.id) : [...effectivePool, p.id];

        if (next.length === 0) {
            setError('Key 池不能为空（至少保留 1 个）');
            return;
        }

        setError(null);
        setSuccess(null);
        setActionLoading(true);
        try {
            await api.post(
                '/admin/model-profiles/set-active',
                kind === 'BRAIN' ? { brainProfileIds: next } : { painterProfileIds: next }
            );
            setSuccess(`已更新 ${kind} Key 池`);
            mutate();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async (p: ModelProfilePublic) => {
        if (!confirm(`确定要删除配置「${p.name}」吗？`)) return;
        setError(null);
        setSuccess(null);
        setActionLoading(true);
        try {
            await api.delete(`/admin/model-profiles/${p.id}`);
            setSuccess('已删除配置');
            mutate();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setActionLoading(false);
        }
    };

    const handleAddKeys = async (group: ModelProfileGroup, keys: string[]) => {
        setError(null);
        setSuccess(null);
        setActionLoading(true);
        try {
            const createdIds: string[] = [];
            const existingCount = group.profiles.length;

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const body = {
                    kind: group.kind,
                    provider: group.provider,
                    name: `${group.model} #${existingCount + i + 1}`,
                    gateway: group.gateway,
                    model: group.model,
                    apiKey: key,
                };
                const res = await api.post('/admin/model-profiles', body);
                const id = res?.data?.profile?.id;
                if (id) createdIds.push(id);
            }

            // If the group we added to matches the ACTIVE group, auto-add to pool
            const currentActiveId = active[group.kind as ModelProfileKind];
            const isActiveGroup = group.profiles.some((p) => p.id === currentActiveId);

            if (isActiveGroup && createdIds.length > 0) {
                const currentPool = activePool[group.kind as ModelProfileKind] || (currentActiveId ? [currentActiveId] : []);
                const next = Array.from(new Set([...currentPool, ...createdIds]));

                await api.post(
                    '/admin/model-profiles/set-active',
                    group.kind === 'BRAIN' ? { brainProfileIds: next } : { painterProfileIds: next }
                );
                setSuccess(`已新增 ${createdIds.length} 个 Key，并加入池`);
            } else {
                setSuccess(`已新增 ${createdIds.length} 个 Key`);
            }
            mutate();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setActionLoading(false);
        }
    };

    const brainProfiles = React.useMemo(() => profiles.filter((p) => p.kind === 'BRAIN'), [profiles]);
    const painterProfiles = React.useMemo(() => profiles.filter((p) => p.kind === 'PAINTER'), [profiles]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="系统设置（模型连接）"
                    description="管理 Brain 与 Painter 的模型连接配置。支持多 Key 负载均衡。"
                />
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleRefresh} disabled={isLoading || actionLoading} className="gap-2">
                        {(isLoading || actionLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        刷新
                    </Button>
                    <Button onClick={() => openCreate()} className="gap-2">
                        <Plus className="h-4 w-4" />
                        新建配置
                    </Button>
                </div>
            </div>

            <Card className="bg-blue-50/50 border-blue-100">
                <CardHeader>
                    <CardTitle className="text-base text-blue-900">重要说明</CardTitle>
                    <CardDescription className="text-blue-700">
                        密钥会被服务端使用 AES-256-GCM 加密存储；必须手动配置环境变量 <span className="font-mono bg-blue-100 px-1 rounded">SETTINGS_ENCRYPTION_KEY</span>（base64，解码后 32 bytes）。
                    </CardDescription>
                </CardHeader>
                {(error || loadError) && (
                    <CardContent className="text-sm text-red-600 font-medium">
                        ERROR: {error || (loadError ? '加载失败' : '')}
                    </CardContent>
                )}
                {success && (
                    <CardContent className="text-sm text-emerald-700 font-medium">
                        {success}
                    </CardContent>
                )}
            </Card>

            <div className="grid gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                        <div>
                            <CardTitle>Brain Profiles</CardTitle>
                            <CardDescription className="mt-1">
                                当前生效：
                                {active.BRAIN ? (
                                    <span className="font-mono bg-slate-100 px-1 py-0.5 rounded ml-1 text-slate-800">{active.BRAIN.slice(0, 8)}</span>
                                ) : '未设置'}
                                {activePool.BRAIN && activePool.BRAIN.length > 1 && (
                                    <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                                        Pool: {activePool.BRAIN.length}
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => openCreate('BRAIN')} className="gap-2">
                            <Plus className="h-4 w-4" /> 新建 Brain
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-4 p-0">
                        <ProfileTable
                            profiles={brainProfiles}
                            activeId={active.BRAIN}
                            poolIds={activePool.BRAIN}
                            loading={actionLoading}
                            testingId={testingId}
                            testResult={testResult}
                            onTest={handleTest}
                            onSetActive={handleSetActive}
                            onTogglePool={handleTogglePool}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onAddKeys={handleAddKeys}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                        <div>
                            <CardTitle>Painter Profiles</CardTitle>
                            <CardDescription className="mt-1">
                                当前生效：
                                {active.PAINTER ? (
                                    <span className="font-mono bg-slate-100 px-1 py-0.5 rounded ml-1 text-slate-800">{active.PAINTER.slice(0, 8)}</span>
                                ) : '未设置'}
                                {activePool.PAINTER && activePool.PAINTER.length > 1 && (
                                    <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                                        Pool: {activePool.PAINTER.length}
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => openCreate('PAINTER')} className="gap-2">
                            <Plus className="h-4 w-4" /> 新建 Painter
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-4 p-0">
                        <ProfileTable
                            profiles={painterProfiles}
                            activeId={active.PAINTER}
                            poolIds={activePool.PAINTER}
                            loading={actionLoading}
                            testingId={testingId}
                            testResult={testResult}
                            onTest={handleTest}
                            onSetActive={handleSetActive}
                            onTogglePool={handleTogglePool}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onAddKeys={handleAddKeys}
                        />
                    </CardContent>
                </Card>
            </div>

            <ProfileDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                editing={editing}
                defaultKind={defaultKind}
                loading={actionLoading}
                onSave={handleSave}
            />
        </div>
    );
}
