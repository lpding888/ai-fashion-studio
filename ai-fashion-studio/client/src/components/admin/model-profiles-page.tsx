"use client";

import * as React from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

    const renderTable = (items: ModelProfilePublic[], activeId?: string) => (
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
                {items.map((p) => {
                    const isActive = p.id === activeId;
                    const lastTest = testResult[p.id];
                    return (
                        <TableRow key={p.id} className={isActive ? 'bg-emerald-50/40' : undefined}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    <span>{p.name}</span>
                                    {isActive && <Badge variant="default">Active</Badge>}
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground max-w-[260px] truncate">{p.gateway}</TableCell>
                            <TableCell className="font-mono text-xs">{p.model}</TableCell>
                            <TableCell className="font-mono text-xs">{p.keyMasked}</TableCell>
                            <TableCell>
                                {p.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Enabled</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
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
                                        disabled={loading || isActive || p.disabled}
                                        className="gap-1"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        生效
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="gap-1">
                                        <Pencil className="h-4 w-4" />
                                        编辑
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeProfile(p)}
                                        disabled={loading || isActive}
                                        className="gap-1 text-red-600 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        删除
                                    </Button>
                                </div>
                                {lastTest && (
                                    <div className={`mt-2 text-xs flex items-center gap-1 ${lastTest.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {lastTest.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                        <span className="truncate max-w-[520px]">{lastTest.message}</span>
                                    </div>
                                )}
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
                    <p className="text-muted-foreground">全站共用：管理员在服务端加密存储，并选择当前生效的 Brain/Painter 配置</p>
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
                    {brainProfiles.length === 0 ? <div className="text-sm text-muted-foreground">暂无 Brain 配置</div> : renderTable(brainProfiles, active.BRAIN)}
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
                    {painterProfiles.length === 0 ? <div className="text-sm text-muted-foreground">暂无 Painter 配置</div> : renderTable(painterProfiles, active.PAINTER)}
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
