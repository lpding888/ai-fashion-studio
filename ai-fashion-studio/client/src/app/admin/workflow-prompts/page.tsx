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
import { Loader2, RefreshCw, Save, CheckCircle2 } from 'lucide-react';

type WorkflowPromptPack = {
  plannerSystemPrompt: string;
  painterSystemPrompt: string;
};

type PromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

type PromptVersion = PromptVersionMeta & { pack: WorkflowPromptPack };

type ActiveRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === 'object') {
    const responseMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (responseMessage) return responseMessage;
    const message = (err as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
};

function formatTime(ms?: number) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('zh-CN');
}

export default function WorkflowPromptsPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const [activeRef, setActiveRef] = React.useState<ActiveRef | null>(null);
  const [activeVersion, setActiveVersion] = React.useState<PromptVersion | null>(null);
  const [versions, setVersions] = React.useState<PromptVersionMeta[]>([]);

  const [note, setNote] = React.useState('');
  const [plannerSystemPrompt, setPlannerSystemPrompt] = React.useState('');
  const [painterSystemPrompt, setPainterSystemPrompt] = React.useState('');

  const authHeaders = React.useMemo(() => {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const [activeRes, versionsRes] = await Promise.all([
        api.get('/admin/workflow-prompts/active', { headers: authHeaders }),
        api.get('/admin/workflow-prompts/versions', { headers: authHeaders }),
      ]);

      const activeData = activeRes.data;
      const versionsData = versionsRes.data;

      setActiveRef(activeData.ref ?? null);
      setActiveVersion(activeData.version ?? null);
      setVersions(versionsData.versions ?? []);

      const pack: WorkflowPromptPack | undefined = activeData?.version?.pack;
      if (pack) {
        setPlannerSystemPrompt(pack.plannerSystemPrompt || '');
        setPainterSystemPrompt(pack.painterSystemPrompt || '');
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadVersionToEditor = async (id: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.get(`/admin/workflow-prompts/versions/${id}`, { headers: authHeaders });
      const v: PromptVersion = res.data.version;
      setPlannerSystemPrompt(v.pack.plannerSystemPrompt || '');
      setPainterSystemPrompt(v.pack.painterSystemPrompt || '');
      setNote(v.note || '');
      setSuccessMsg(`已加载版本：${id.slice(0, 8)}`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, '加载版本失败'));
    }
  };

  const createVersion = async (publish: boolean) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await api.post(
        '/admin/workflow-prompts/versions',
        {
          pack: {
            plannerSystemPrompt,
            painterSystemPrompt,
          } as WorkflowPromptPack,
          note,
          publish,
        },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } },
      );
      const created: PromptVersionMeta = res.data.version;
      setSuccessMsg(publish ? `已发布新版本：${created.versionId.slice(0, 8)}` : `已保存版本：${created.versionId.slice(0, 8)}`);
      await loadAll();
    } catch (e: unknown) {
      setError(getErrorMessage(e, '保存失败'));
    } finally {
      setLoading(false);
    }
  };

  const publishVersion = async (versionId: string) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await api.post(
        '/admin/workflow-prompts/publish',
        { versionId },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } },
      );
      setSuccessMsg(`已发布版本：${versionId.slice(0, 8)}`);
      await loadAll();
    } catch (e: unknown) {
      setError(getErrorMessage(e, '发布失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">工作流提示词</h2>
          <p className="text-muted-foreground">管理 Hero 母版与分镜规划的提示词版本</p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-red-700">{error}</CardContent>
        </Card>
      )}
      {successMsg && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-green-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {successMsg}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>当前生效版本</CardTitle>
          <CardDescription>用于 hero_storyboard 工作流</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline">active: {activeRef?.versionId ? activeRef.versionId.slice(0, 8) : '-'}</Badge>
            <span className="text-muted-foreground">更新时间：{formatTime(activeRef?.updatedAt)}</span>
            <span className="text-muted-foreground">更新人：{activeRef?.updatedBy?.username || '-'}</span>
          </div>
          {activeVersion && (
            <div className="text-xs text-muted-foreground">
              sha256: <span className="font-mono">{activeVersion.sha256}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>编辑器</CardTitle>
          <CardDescription>修改后可保存为新版本，并可选择发布</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>版本备注（可选）</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：Hero 强化一致性 + 手账模板收敛" />
          </div>

          <div className="space-y-2">
            <Label>Planner System Prompt（大脑）</Label>
            <Textarea
              value={plannerSystemPrompt}
              onChange={(e) => setPlannerSystemPrompt(e.target.value)}
              className="min-h-[220px] font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>Painter System Prompt（生图）</Label>
            <Textarea
              value={painterSystemPrompt}
              onChange={(e) => setPainterSystemPrompt(e.target.value)}
              className="min-h-[220px] font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => createVersion(false)} disabled={loading} variant="outline" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存版本
            </Button>
            <Button onClick={() => createVersion(true)} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              保存并发布
            </Button>
            {activeRef?.versionId && (
              <Button
                onClick={() => publishVersion(activeRef.versionId)}
                disabled={loading}
                variant="secondary"
                className="gap-2"
              >
                重新发布当前 active
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>版本列表</CardTitle>
          <CardDescription>点击加载到编辑器，或发布某个版本</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>版本</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>创建人</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => {
                const isActive = activeRef?.versionId === v.versionId;
                return (
                  <TableRow key={v.versionId}>
                    <TableCell className="font-mono text-xs">
                      {v.versionId.slice(0, 8)} {isActive && <Badge className="ml-2">active</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{formatTime(v.createdAt)}</TableCell>
                    <TableCell className="text-sm">{v.createdBy?.username || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.note || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => loadVersionToEditor(v.versionId)} disabled={loading}>
                          加载
                        </Button>
                        <Button size="sm" onClick={() => publishVersion(v.versionId)} disabled={loading}>
                          发布
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                    暂无版本（首次启动会从 docs/workflow-prompts 自动 seed）
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
