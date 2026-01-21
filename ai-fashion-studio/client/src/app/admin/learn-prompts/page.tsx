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

type LearnPromptPack = {
  styleLearnPrompt: string;
  poseLearnPrompt: string;
};

type PromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

type PromptVersion = PromptVersionMeta & { pack: LearnPromptPack };

type ActiveRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

function formatTime(ms?: number) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('zh-CN');
}

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } }; message?: string };
  return maybe?.response?.data?.message || (error instanceof Error ? error.message : fallback);
}

export default function LearnPromptsPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const [activeRef, setActiveRef] = React.useState<ActiveRef | null>(null);
  const [activeVersion, setActiveVersion] = React.useState<PromptVersion | null>(null);
  const [versions, setVersions] = React.useState<PromptVersionMeta[]>([]);

  const [note, setNote] = React.useState('');
  const [styleLearnPrompt, setStyleLearnPrompt] = React.useState('');
  const [poseLearnPrompt, setPoseLearnPrompt] = React.useState('');

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
        api.get('/admin/learn-prompts/active', { headers: authHeaders }),
        api.get('/admin/learn-prompts/versions', { headers: authHeaders }),
      ]);

      const activeData = activeRes.data;
      const versionsData = versionsRes.data;

      setActiveRef(activeData.ref ?? null);
      setActiveVersion(activeData.version ?? null);
      setVersions(versionsData.versions ?? []);

      const pack: LearnPromptPack | undefined = activeData?.version?.pack;
      if (pack) {
        setStyleLearnPrompt(pack.styleLearnPrompt || '');
        setPoseLearnPrompt(pack.poseLearnPrompt || '');
        setNote(activeData?.version?.note || '');
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
      const res = await api.get(`/admin/learn-prompts/versions/${id}`, { headers: authHeaders });
      const v: PromptVersion = res.data.version;
      setStyleLearnPrompt(v.pack.styleLearnPrompt || '');
      setPoseLearnPrompt(v.pack.poseLearnPrompt || '');
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
        '/admin/learn-prompts/versions',
        { pack: { styleLearnPrompt, poseLearnPrompt } as LearnPromptPack, note, publish },
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
        '/admin/learn-prompts/publish',
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
          <h2 className="text-3xl font-bold tracking-tight">学习提示词</h2>
          <p className="text-muted-foreground">管理风格学习与动作（姿势）学习的系统提示词版本</p>
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
          <CardDescription>用于风格/姿势学习</CardDescription>
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
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：更严格的 JSON 指令" />
          </div>

          <div className="space-y-2">
            <Label>风格学习提示词</Label>
            <Textarea
              value={styleLearnPrompt}
              onChange={(e) => setStyleLearnPrompt(e.target.value)}
              className="min-h-[240px] font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>动作/姿势学习提示词</Label>
            <Textarea
              value={poseLearnPrompt}
              onChange={(e) => setPoseLearnPrompt(e.target.value)}
              className="min-h-[240px] font-mono text-xs"
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
              <Button onClick={() => publishVersion(activeRef.versionId)} disabled={loading} variant="secondary">
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
              {versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    暂无版本（首次启动会从 docs/learn-prompts 自动 seed）
                  </TableCell>
                </TableRow>
              )}
              {versions.map((v) => (
                <TableRow key={v.versionId}>
                  <TableCell className="font-mono text-xs">
                    {v.versionId.slice(0, 8)}
                    {activeRef?.versionId === v.versionId ? <Badge className="ml-2">active</Badge> : null}
                  </TableCell>
                  <TableCell>{formatTime(v.createdAt)}</TableCell>
                  <TableCell>{v.createdBy?.username || '-'}</TableCell>
                  <TableCell className="max-w-[380px] truncate">{v.note || '-'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => loadVersionToEditor(v.versionId)}>
                      加载
                    </Button>
                    <Button size="sm" onClick={() => publishVersion(v.versionId)} disabled={loading}>
                      发布
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
