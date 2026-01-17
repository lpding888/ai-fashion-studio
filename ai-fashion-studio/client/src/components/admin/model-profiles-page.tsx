"use client";

import * as React from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';

export type ModelProfileKind = 'BRAIN' | 'PAINTER';

export type ModelProfilePublic = {
    id: string;
    kind: ModelProfileKind;
    name: string;
    gateway: string;
    model: string;
    keyMasked: string;
    disabled?: boolean;
    createdAt: number;
    createdBy: { id: string; username: string };
    updatedAt: number;
    updatedBy: { id: string; username: string };
};

export function ModelProfilesPage() {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const [active, setActive] = React.useState<{ BRAIN?: string; PAINTER?: string }>({});
    const [activePool, setActivePool] = React.useState<{ BRAIN?: string[]; PAINTER?: string[] }>({});
    const [profiles, setProfiles] = React.useState<ModelProfilePublic[]>([]);

    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<ModelProfilePublic | null>(null);

    const [kind, setKind] = React.useState<ModelProfileKind>('BRAIN');
    const [name, setName] = React.useState('');
    const [gateway, setGateway] = React.useState('https://api.vectorengine.ai/v1');
    const [model, setModel] = React.useState('');
    const [apiKey, setApiKey] = React.useState('');
    const [disabled, setDisabled] = React.useState(false);

    const [testingId, setTestingId] = React.useState<string | null>(null);
    const [testResult, setTestResult] = React.useState<Record<string, { ok: boolean; message: string }>>({});

    const [addingGroup, setAddingGroup] = React.useState<string | null>(null); // `${kind}|${gateway}|${model}`
    const [addingKeysText, setAddingKeysText] = React.useState('');

    const authHeaders = React.useMemo(() => {
        if (typeof window === 'undefined') return {};
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const getErrorMessage = (e: unknown) => {
        if (typeof e === 'object' && e !== null && 'response' in e) {
            const response = (e as any).response;
            const msg = response?.data?.message;
            if (typeof msg === 'string') return msg;
        }
        return e instanceof Error ? e.message : 'Unknown error';
    };

    const loadProfiles = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await api.get('/admin/model-profiles', { headers: authHeaders });
            setActive(res.data.active || {});
            setActivePool(res.data.activePool || {});
            setProfiles(res.data.profiles || []);
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadProfiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetDialog = (nextKind?: ModelProfileKind) => {
        setEditing(null);
        setKind(nextKind || 'BRAIN');
        setName('');
        setGateway('https://api.vectorengine.ai/v1');
        setModel('');
        setApiKey('');
        setDisabled(false);
    };

    const openCreate = (nextKind?: ModelProfileKind) => {
        resetDialog(nextKind);
        setDialogOpen(true);
    };

    const openEdit = (p: ModelProfilePublic) => {
        setEditing(p);
        setKind(p.kind);
        setName(p.name);
        setGateway(p.gateway);
        setModel(p.model);
        setApiKey('');
        setDisabled(!!p.disabled);
        setDialogOpen(true);
    };

    const saveProfile = async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
            if (!name.trim()) throw new Error('名称不能为空');
            if (!gateway.trim()) throw new Error('网关不能为空');
            if (!model.trim()) throw new Error('模型不能为空');

            if (editing) {
                const body: any = {
                    name: name.trim(),
                    gateway: gateway.trim(),
                    model: model.trim(),
                    disabled,
                };
                if (apiKey.trim()) body.apiKey = apiKey.trim();

                await api.patch(`/admin/model-profiles/${editing.id}`, body, { headers: authHeaders });
                setSuccess('已更新配置');
            } else {
                if (!apiKey.trim()) throw new Error('密钥不能为空');
                await api.post(
                    '/admin/model-profiles',
                    {
                        kind,
                        name: name.trim(),
                        gateway: gateway.trim(),
                        model: model.trim(),
                        apiKey: apiKey.trim(),
                    },
                    { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
                );
                setSuccess('已创建配置');
            }

            setDialogOpen(false);
            await loadProfiles();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const setAsActive = async (p: ModelProfilePublic) => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
            await api.post(
                '/admin/model-profiles/set-active',
                p.kind === 'BRAIN' ? { brainProfileId: p.id } : { painterProfileId: p.id },
                { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
            );
            setSuccess(`已设置为当前生效：${p.name}`);
            await loadProfiles();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const setAsActivePool = async (kind: ModelProfileKind, ids: string[]) => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
            await api.post(
                '/admin/model-profiles/set-active',
                kind === 'BRAIN' ? { brainProfileIds: ids } : { painterProfileIds: ids },
                { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
            );
            setSuccess(`已更新 ${kind} Key 池（${ids.length} 个）`);
            await loadProfiles();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const togglePoolMember = async (p: ModelProfilePublic) => {
        const kind = p.kind;
        const rawCurrent = (activePool[kind] && activePool[kind]!.length > 0)
            ? activePool[kind]!
            : (active[kind] ? [active[kind] as string] : []);

        const getById = (id: string) => profiles.find((x) => x.id === id);
        const currentProfiles = rawCurrent.map(getById).filter(Boolean) as ModelProfilePublic[];
        const currentGroup = currentProfiles[0] ? { gateway: currentProfiles[0].gateway, model: currentProfiles[0].model } : undefined;

        const isSameGroup = currentGroup ? (p.gateway === currentGroup.gateway && p.model === currentGroup.model) : true;
        const current = isSameGroup ? rawCurrent : [];

        if (!isSameGroup) {
            // 切换到该组：避免把不同网关/模型混进同一个 activePool
            await setAsActive(p);
            return;
        }

        const has = current.includes(p.id);
        const next = has ? current.filter((id) => id !== p.id) : [...current, p.id];
        if (next.length === 0) {
            setError('Key 池不能为空（至少保留 1 个）');
            return;
        }
        await setAsActivePool(kind, next);
    };

    const testProfile = async (id: string) => {
        setTestingId(id);
        try {
            const res = await api.post(`/admin/model-profiles/${id}/test`, {}, { headers: authHeaders });
            setTestResult((prev) => ({ ...prev, [id]: res.data.result }));
        } catch (e: unknown) {
            setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: getErrorMessage(e) } }));
        } finally {
            setTestingId(null);
        }
    };

    const removeProfile = async (p: ModelProfilePublic) => {
        if (!confirm(`确定要删除配置「${p.name}」吗？`)) return;
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
            await api.delete(`/admin/model-profiles/${p.id}`, { headers: authHeaders });
            setSuccess('已删除配置');
            await loadProfiles();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const brainProfiles = React.useMemo(() => profiles.filter((p) => p.kind === 'BRAIN'), [profiles]);
    const painterProfiles = React.useMemo(() => profiles.filter((p) => p.kind === 'PAINTER'), [profiles]);

    type ProfileGroup = {
        kind: ModelProfileKind;
        gateway: string;
        model: string;
        profiles: ModelProfilePublic[];
    };

    const groupProfiles = (items: ModelProfilePublic[]) => {
        const map = new Map<string, ProfileGroup>();
        for (const p of items) {
            const key = `${p.kind}|${p.gateway}|${p.model}`;
            const existing = map.get(key);
            if (existing) {
                existing.profiles.push(p);
            } else {
                map.set(key, { kind: p.kind, gateway: p.gateway, model: p.model, profiles: [p] });
            }
        }
        return Array.from(map.values());
    };

    const parseKeys = (raw: string) =>
        raw
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);

    const buildAutoName = (base: string, index: number) => {
        const safe = (base || '').trim() || 'key';
        return `${safe} #${index}`;
    };

    const addKeysToGroup = async (group: ProfileGroup, activeId?: string, poolIds?: string[]) => {
        const keys = parseKeys(addingKeysText);
        if (keys.length === 0) {
            setError('请输入至少 1 个 API Key（支持多行）');
            return;
        }

        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const createdIds: string[] = [];
            const existingCount = group.profiles.length;

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const body = {
                    kind: group.kind,
                    name: buildAutoName(group.model, existingCount + i + 1),
                    gateway: group.gateway,
                    model: group.model,
                    apiKey: key,
                };
                const res = await api.post('/admin/model-profiles', body, { headers: authHeaders });
                const id = res?.data?.profile?.id as string | undefined;
                if (id) createdIds.push(id);
            }

            await loadProfiles();

            // 仅在“当前生效组”内自动加入池（避免误切换到其他模型/网关）
            const effectivePool = (poolIds && poolIds.length > 0) ? poolIds : (activeId ? [activeId] : []);
            const isActiveGroup = !!activeId && group.profiles.some((p) => p.id === activeId);

            if (isActiveGroup && createdIds.length > 0) {
                const next = Array.from(new Set([...effectivePool, ...createdIds]));
                await setAsActivePool(group.kind, next);
                setSuccess(`已新增 ${createdIds.length} 个 Key，并加入池`);
            } else {
                setSuccess(`已新增 ${createdIds.length} 个 Key（未自动加入池；请先把该组设为主Key/加入池）`);
            }

            setAddingKeysText('');
            setAddingGroup(null);
        } catch (e: unknown) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const renderTable = (items: ModelProfilePublic[], activeId?: string, poolIds?: string[]) => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>网关</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>密钥</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {groupProfiles(items).map((group) => {
                    const pool = (poolIds && poolIds.length > 0) ? poolIds : (activeId ? [activeId] : []);
                    const groupHasActive = !!activeId && group.profiles.some((p) => p.id === activeId);

                    const sorted = [...group.profiles].sort((a, b) => {
                        const aPrimary = a.id === activeId ? 1 : 0;
                        const bPrimary = b.id === activeId ? 1 : 0;
                        if (aPrimary !== bPrimary) return bPrimary - aPrimary;
                        const aInPool = pool.includes(a.id) ? 1 : 0;
                        const bInPool = pool.includes(b.id) ? 1 : 0;
                        if (aInPool !== bInPool) return bInPool - aInPool;
                        return b.updatedAt - a.updatedAt;
                    });

                    const groupKey = `${group.kind}|${group.gateway}|${group.model}`;
                    const isAdding = addingGroup === groupKey;

                    return (
                        <TableRow key={groupKey} className={groupHasActive ? 'bg-emerald-50/40' : undefined}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground">{group.kind}</span>
                                    <span>{group.model}</span>
                                    {groupHasActive && <Badge variant="default">当前生效</Badge>}
                                    <Badge variant="secondary">{sorted.length} keys</Badge>
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground max-w-[260px] truncate">{group.gateway}</TableCell>
                            <TableCell className="font-mono text-xs">{group.model}</TableCell>
                            <TableCell className="space-y-2">
                                {sorted.map((p) => {
                                    const isPrimary = p.id === activeId;
                                    const isInPool = pool.includes(p.id);
                                    const lastTest = testResult[p.id];
                                    return (
                                        <div key={p.id} className="rounded border border-border/60 p-2 bg-background/50">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs">{p.keyMasked}</span>
                                                        {isPrimary && <Badge variant="default">Active</Badge>}
                                                        {!isPrimary && isInPool && <Badge variant="secondary">Pool</Badge>}
                                                        {p.disabled && <Badge variant="outline">Disabled</Badge>}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate" title={p.name}>{p.name}</div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => testProfile(p.id)}
                                                        disabled={testingId === p.id}
                                                        className="gap-1"
                                                    >
                                                        {testingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                                        测试
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setAsActive(p)}
                                                        disabled={loading || isPrimary || p.disabled}
                                                        className="gap-1"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                        设为主Key
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => togglePoolMember(p)}
                                                        disabled={loading || p.disabled}
                                                        className="gap-1"
                                                    >
                                                        {isInPool ? <XCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                        {isInPool ? '停用' : '启用'}
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="gap-1">
                                                        <Pencil className="h-4 w-4" />
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeProfile(p)}
                                                        disabled={loading}
                                                        className="gap-1 text-red-600 hover:text-red-700"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        删除
                                                    </Button>
                                                </div>
                                            </div>

                                            {lastTest && (
                                                <div className={`mt-2 text-xs flex items-center gap-1 ${lastTest.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                                                    {lastTest.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                    <span className="truncate max-w-[520px]">{lastTest.message}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {isAdding ? (
                                    <div className="rounded border border-dashed border-border p-3 bg-background/50 space-y-2">
                                        <div className="text-xs text-muted-foreground">粘贴 API Key（支持多行，每行一把）</div>
                                        <Textarea
                                            value={addingKeysText}
                                            onChange={(e) => setAddingKeysText(e.target.value)}
                                            placeholder="每行一把 key，例如：sk-..."
                                            className="min-h-[96px]"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setAddingGroup(null);
                                                    setAddingKeysText('');
                                                }}
                                            >
                                                取消
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => addKeysToGroup(group, activeId, poolIds)}
                                                disabled={loading}
                                                className="gap-1"
                                            >
                                                <Plus className="h-4 w-4" />
                                                添加 Key
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setAddingGroup(groupKey);
                                            setAddingKeysText('');
                                        }}
                                        className="gap-1"
                                    >
                                        <Plus className="h-4 w-4" />
                                        添加 Key
                                    </Button>
                                )}
                            </TableCell>
                            <TableCell>
                                <div className="text-xs text-muted-foreground">此组 Key 共享网关/模型</div>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="text-xs text-muted-foreground">—</div>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">系统设置（模型连接）</h2>
                    <p className="text-muted-foreground">全站共用：管理员在服务端加密存储；支持把多个配置加入 Key 池用于高并发（主Key=池中第一个）</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={loadProfiles} disabled={loading} className="gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        刷新
                    </Button>
                    <Button onClick={() => openCreate()} className="gap-2">
                        <Plus className="h-4 w-4" />
                        新建配置
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>重要说明</CardTitle>
                    <CardDescription>
                        密钥会被服务端使用 AES-256-GCM 加密存储；必须手动配置环境变量 <span className="font-mono">SETTINGS_ENCRYPTION_KEY</span>（base64，解码后 32 bytes）。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {error && <div className="text-sm text-red-600">{error}</div>}
                    {success && <div className="text-sm text-emerald-700">{success}</div>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Brain Profiles</CardTitle>
                        <CardDescription>当前生效：{active.BRAIN ? active.BRAIN.slice(0, 8) : '未设置'}</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => openCreate('BRAIN')} className="gap-2">
                        <Plus className="h-4 w-4" /> 新建 Brain
                    </Button>
                </CardHeader>
                <CardContent>
                    {brainProfiles.length === 0 ? <div className="text-sm text-muted-foreground">暂无 Brain 配置</div> : renderTable(brainProfiles, active.BRAIN, activePool.BRAIN)}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Painter Profiles</CardTitle>
                        <CardDescription>当前生效：{active.PAINTER ? active.PAINTER.slice(0, 8) : '未设置'}</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => openCreate('PAINTER')} className="gap-2">
                        <Plus className="h-4 w-4" /> 新建 Painter
                    </Button>
                </CardHeader>
                <CardContent>
                    {painterProfiles.length === 0 ? <div className="text-sm text-muted-foreground">暂无 Painter 配置</div> : renderTable(painterProfiles, active.PAINTER, activePool.PAINTER)}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={(v) => {
                setDialogOpen(v);
                if (!v) resetDialog();
            }}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>{editing ? '编辑配置' : '新建配置'}</DialogTitle>
                        <DialogDescription>
                            {editing ? '不填密钥表示保持不变；密钥不会明文展示。' : '密钥仅用于创建时提交一次，服务端会加密存储。'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {!editing && (
                            <div className="space-y-2">
                                <Label>类型</Label>
                                <Select value={kind} onValueChange={(v: ModelProfileKind) => setKind(v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择类型" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="BRAIN">BRAIN</SelectItem>
                                        <SelectItem value="PAINTER">PAINTER</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>名称</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Gemini 3 Pro（主）" />
                        </div>

                        <div className="space-y-2">
                            <Label>网关 (Gateway)</Label>
                            <Input value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="https://api.vectorengine.ai/v1" />
                        </div>

                        <div className="space-y-2">
                            <Label>模型 (Model)</Label>
                            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="例如：gemini-2.0-flash-exp" />
                        </div>

                        <div className="space-y-2">
                            <Label>密钥 (API Key)</Label>
                            <Input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={editing ? '留空表示不修改' : '必填'}
                            />
                        </div>

                        {editing && (
                            <div className="space-y-2">
                                <Label>状态</Label>
                                <Select value={disabled ? 'disabled' : 'enabled'} onValueChange={(v) => setDisabled(v === 'disabled')}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择状态" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="enabled">Enabled</SelectItem>
                                        <SelectItem value="disabled">Disabled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                        <Button onClick={saveProfile} disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
