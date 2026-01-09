'use client';

import * as React from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Save, GitCompare, CheckCircle2 } from 'lucide-react';

type PromptVersionMeta = {
    versionId: string;
    sha256: string;
    createdAt: number;
    createdBy: { id: string; username: string };
    note?: string;
};

type PromptVersion = PromptVersionMeta & { content: string };

type ActiveRef = {
    versionId: string;
    updatedAt: number;
    updatedBy: { id: string; username: string };
};

function formatTime(ms?: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('zh-CN');
}

export default function BrainPromptsPage() {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    const [activeRef, setActiveRef] = React.useState<ActiveRef | null>(null);
    const [activeVersion, setActiveVersion] = React.useState<PromptVersion | null>(null);
    const [versions, setVersions] = React.useState<PromptVersionMeta[]>([]);

    const [note, setNote] = React.useState('');
    const [editorContent, setEditorContent] = React.useState('');

    const [taskId, setTaskId] = React.useState('');
    const [versionA, setVersionA] = React.useState('');
    const [versionB, setVersionB] = React.useState('');

    const [comparing, setComparing] = React.useState(false);
    const [compareResult, setCompareResult] = React.useState<any>(null);

    const authHeaders = React.useMemo(() => {
        if (typeof window === 'undefined') return {};
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        try {
            const [activeRes, versionsRes] = await Promise.all([
                api.get('/admin/brain-prompts/active', { headers: authHeaders }),
                api.get('/admin/brain-prompts/versions', { headers: authHeaders }),
            ]);

            const activeData = activeRes.data;
            const versionsData = versionsRes.data;

            setActiveRef(activeData.ref ?? null);
            setActiveVersion(activeData.version ?? null);
            setVersions(versionsData.versions ?? []);

            const activeId = activeData?.ref?.versionId as string | undefined;
            if (activeId) {
                setVersionA((prev) => prev || activeId);
                setVersionB((prev) => prev || activeId);
            }
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message || '加载失败');
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadVersionToEditor = async (id: string) => {
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await api.get(`/admin/brain-prompts/versions/${id}`, { headers: authHeaders });
            const v: PromptVersion = res.data.version;
            setEditorContent(v.content);
            setNote(v.note || '');
            setSuccessMsg(`已加载版本：${id.slice(0, 8)}`);
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message || '加载版本失败');
        }
    };

    const createVersion = async (publish: boolean) => {
        setError(null);
        setSuccessMsg(null);
        setLoading(true);
        try {
            const res = await api.post(
                '/admin/brain-prompts/versions',
                { content: editorContent, note, publish },
                { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
            );
            const created: PromptVersionMeta = res.data.version;
            setSuccessMsg(publish ? `已发布新版本：${created.versionId.slice(0, 8)}` : `已保存版本：${created.versionId.slice(0, 8)}`);
            await loadAll();

            if (publish) {
                setVersionA(created.versionId);
            } else {
                setVersionB(created.versionId);
            }
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    const publishExisting = async (id: string) => {
        setError(null);
        setSuccessMsg(null);
        setLoading(true);
        try {
            await api.post(
                '/admin/brain-prompts/publish',
                { versionId: id },
                { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
            );
            setSuccessMsg(`已发布版本：${id.slice(0, 8)}`);
            await loadAll();
            setVersionA(id);
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message || '发布失败');
        } finally {
            setLoading(false);
        }
    };

    const runCompare = async () => {
        if (!taskId.trim()) {
            setError('请输入 taskId');
            return;
        }
        if (!versionA || !versionB) {
            setError('请选择版本 A/B');
            return;
        }
        if (versionA === versionB) {
            setError('版本 A 与版本 B 需要不同');
            return;
        }

        setComparing(true);
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await api.post(
                '/admin/brain-prompts/ab-compare',
                { taskId: taskId.trim(), versionA, versionB },
                { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
            );
            setCompareResult(res.data);
            setSuccessMsg('A/B 对照完成');
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message || 'A/B 对照失败');
        } finally {
            setComparing(false);
        }
    };

    const shotsRows = React.useMemo(() => {
        const planA = compareResult?.planA;
        const planB = compareResult?.planB;
        const shotsA: any[] = planA?.shots || [];
        const shotsB: any[] = planB?.shots || [];

        const indexB = new Map<string, any>();
        for (const s of shotsB) {
            const key = String(s.shot_id ?? s.id ?? s.type ?? '');
            if (key) indexB.set(key, s);
        }

        return shotsA.map((a) => {
            const key = String(a.shot_id ?? a.id ?? a.type ?? '');
            const b = indexB.get(key);
            return {
                key,
                type: a.type,
                promptA: a.prompt_en || a.prompt || '',
                promptB: b?.prompt_en || b?.prompt || '',
            };
        });
    }, [compareResult]);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">大脑系统提示词</h2>
                    <p className="text-muted-foreground">版本管理、发布、以及基于已有 taskId 的 A/B 对照（仅 Brain plan）</p>
                </div>
                <Button variant="outline" onClick={loadAll} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    刷新
                </Button>
            </div>

            {(error || successMsg) && (
                <div className={`rounded-md border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
                    {error ? error : (
                        <span className="inline-flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            {successMsg}
                        </span>
                    )}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>当前生效版本</CardTitle>
                        <CardDescription>
                            版本：{activeRef?.versionId ? <code>{activeRef.versionId}</code> : '-'}，更新时间：{formatTime(activeRef?.updatedAt)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">SHA256: {activeVersion?.sha256?.slice(0, 12) || '-'}</Badge>
                            <Badge variant="outline">创建者: {activeVersion?.createdBy?.username || '-'}</Badge>
                            <Badge variant="outline">创建时间: {formatTime(activeVersion?.createdAt)}</Badge>
                        </div>
                        <Textarea value={activeVersion?.content || ''} readOnly className="min-h-[220px] font-mono text-xs" />
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                disabled={!activeRef?.versionId}
                                onClick={() => activeRef?.versionId && loadVersionToEditor(activeRef.versionId)}
                            >
                                加载到编辑器
                            </Button>
                            <Button
                                variant="outline"
                                disabled={!activeRef?.versionId}
                                onClick={() => activeRef?.versionId && setVersionA(activeRef.versionId)}
                            >
                                设为 A
                            </Button>
                            <Button
                                variant="outline"
                                disabled={!activeRef?.versionId}
                                onClick={() => activeRef?.versionId && setVersionB(activeRef.versionId)}
                            >
                                设为 B
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>编辑器</CardTitle>
                        <CardDescription>保存为新版本；可选择立即发布（立刻用于新任务）</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>版本备注（可选）</Label>
                            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：更强调镜头多样性" />
                        </div>
                        <div className="space-y-2">
                            <Label>系统提示词内容</Label>
                            <Textarea value={editorContent} onChange={(e) => setEditorContent(e.target.value)} className="min-h-[260px] font-mono text-xs" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => createVersion(false)} disabled={loading}>
                                <Save className="mr-2 h-4 w-4" />
                                保存为版本
                            </Button>
                            <Button onClick={() => createVersion(true)} disabled={loading} className="bg-green-600 hover:bg-green-700">
                                <Save className="mr-2 h-4 w-4" />
                                保存并发布
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>历史版本</CardTitle>
                    <CardDescription>点击加载/发布；A/B 对照建议选择“当前生效版本”作为 A</CardDescription>
                </CardHeader>
                <CardContent>
                    {versions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无版本</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>版本</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>创建者</TableHead>
                                    <TableHead>备注</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {versions.map((v) => (
                                    <TableRow key={v.versionId}>
                                        <TableCell className="font-mono text-xs">{v.versionId}</TableCell>
                                        <TableCell className="text-muted-foreground">{formatTime(v.createdAt)}</TableCell>
                                        <TableCell>{v.createdBy?.username || '-'}</TableCell>
                                        <TableCell className="text-muted-foreground">{v.note || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => loadVersionToEditor(v.versionId)}>加载</Button>
                                                <Button variant="ghost" size="sm" onClick={() => setVersionA(v.versionId)}>设A</Button>
                                                <Button variant="ghost" size="sm" onClick={() => setVersionB(v.versionId)}>设B</Button>
                                                <Button variant="outline" size="sm" onClick={() => publishExisting(v.versionId)}>发布</Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>A/B 对照（taskId）</CardTitle>
                    <CardDescription>同一 taskId，分别用版本 A/B 生成 Brain plan，用于对照 prompt 与镜头策略</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2 md:col-span-1">
                            <Label>taskId</Label>
                            <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="例如：f3c2...（完整ID）" />
                        </div>
                        <div className="space-y-2">
                            <Label>版本 A</Label>
                            <Input value={versionA} onChange={(e) => setVersionA(e.target.value)} placeholder="从上方复制版本ID" />
                        </div>
                        <div className="space-y-2">
                            <Label>版本 B</Label>
                            <Input value={versionB} onChange={(e) => setVersionB(e.target.value)} placeholder="从上方复制版本ID" />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={runCompare} disabled={comparing}>
                            {comparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompare className="mr-2 h-4 w-4" />}
                            运行对比
                        </Button>
                    </div>

                    {compareResult?.success && (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Plan A</CardTitle>
                                    <CardDescription>版本：<code>{compareResult.metaA?.versionId}</code></CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(compareResult.planA, null, 2)}</pre>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Plan B</CardTitle>
                                    <CardDescription>版本：<code>{compareResult.metaB?.versionId}</code></CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(compareResult.planB, null, 2)}</pre>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {compareResult?.success && shotsRows.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>镜头 Prompt 对照（按 shot_id/id/type 粗略匹配）</CardTitle>
                                <CardDescription>用于快速看 prompt_en 的差异（更细的 diff 后续再做）</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>镜头</TableHead>
                                            <TableHead>Prompt A</TableHead>
                                            <TableHead>Prompt B</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shotsRows.map((r: any) => (
                                            <TableRow key={r.key}>
                                                <TableCell className="w-[180px]">
                                                    <div className="font-mono text-xs">{r.key}</div>
                                                    <div className="text-xs text-muted-foreground">{r.type}</div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="whitespace-pre-wrap break-words text-xs">{r.promptA}</div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="whitespace-pre-wrap break-words text-xs">{r.promptB}</div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
