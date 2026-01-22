'use client';

import * as React from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/shared/page-header';
import { ActiveRef, PromptVersion, PromptVersionMeta, CompareResult } from './types';
import { ActiveVersionCard } from './active-version-card';
import { PromptEditor } from './prompt-editor';
import { VersionHistory } from './version-history';
import { ABTestPanel } from './ab-test-panel';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function BrainPromptsPage() {
    // ---- Data Fetching (Use SWR) ----
    // We can fetch active and versions in parallel
    const {
        data: activeData,
        error: activeError,
        mutate: mutateActive,
        isLoading: activeLoading
    } = useSWR<{ ref: ActiveRef; version: PromptVersion }>('/admin/brain-prompts/active', fetcher);

    const {
        data: versionsData,
        error: versionsError,
        mutate: mutateVersions,
        isLoading: versionsLoading
    } = useSWR<{ versions: PromptVersionMeta[] }>('/admin/brain-prompts/versions', fetcher);

    const isLoading = activeLoading || versionsLoading;
    const error = activeError || versionsError;

    // ---- Local State ----
    const [actionLoading, setActionLoading] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    // Editor state
    const [note, setNote] = React.useState('');
    const [editorContent, setEditorContent] = React.useState('');

    // AB Test state
    const [taskId, setTaskId] = React.useState('');
    const [versionA, setVersionA] = React.useState('');
    const [versionB, setVersionB] = React.useState('');
    const [comparing, setComparing] = React.useState(false);
    const [compareResult, setCompareResult] = React.useState<CompareResult | null>(null);

    // Sync Active Version ID to AB Test inputs when data loads
    React.useEffect(() => {
        if (activeData?.ref?.versionId) {
            setVersionA((prev) => prev || activeData.ref.versionId);
            setVersionB((prev) => prev || activeData.ref.versionId);
        }
    }, [activeData]);

    const getErrorMessage = (error: unknown, fallback: string) => {
        const maybe = error as { response?: { data?: { message?: string } }; message?: string };
        return maybe?.response?.data?.message || (error instanceof Error ? error.message : fallback);
    };

    const handleRefresh = () => {
        mutateActive();
        mutateVersions();
        setSuccessMsg('已刷新');
        setTimeout(() => setSuccessMsg(null), 2000);
    };

    const loadVersionToEditor = async (id: string) => {
        setActionError(null);
        setSuccessMsg(null);
        try {
            const res = await api.get(`/admin/brain-prompts/versions/${id}`);
            const v: PromptVersion = res.data.version;
            setEditorContent(v.content);
            setNote(v.note || '');
            setSuccessMsg(`已加载版本：${id.slice(0, 8)}`);
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, '加载版本失败'));
        }
    };

    const createVersion = async (publish: boolean) => {
        setActionError(null);
        setSuccessMsg(null);
        setActionLoading(true);
        try {
            const res = await api.post('/admin/brain-prompts/versions', {
                content: editorContent,
                note,
                publish
            });
            const created: PromptVersionMeta = res.data.version;
            setSuccessMsg(publish ? `已发布新版本：${created.versionId.slice(0, 8)}` : `已保存版本：${created.versionId.slice(0, 8)}`);
            mutateActive();
            mutateVersions();

            if (publish) {
                setVersionA(created.versionId);
            } else {
                setVersionB(created.versionId);
            }
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, '保存失败'));
        } finally {
            setActionLoading(false);
        }
    };

    const publishExisting = async (id: string) => {
        setActionError(null);
        setSuccessMsg(null);
        setActionLoading(true);
        try {
            await api.post('/admin/brain-prompts/publish', { versionId: id });
            setSuccessMsg(`已发布版本：${id.slice(0, 8)}`);
            mutateActive();
            setVersionA(id);
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, '发布失败'));
        } finally {
            setActionLoading(false);
        }
    };

    const runCompare = async () => {
        if (!taskId.trim()) {
            setActionError('请输入 taskId');
            return;
        }
        if (!versionA || !versionB) {
            setActionError('请选择版本 A/B');
            return;
        }
        if (versionA === versionB) {
            setActionError('版本 A 与版本 B 需要不同');
            return;
        }

        setComparing(true);
        setActionError(null);
        setSuccessMsg(null);
        try {
            const res = await api.post('/admin/brain-prompts/ab-compare', {
                taskId: taskId.trim(),
                versionA,
                versionB
            });
            setCompareResult(res.data);
            setSuccessMsg('A/B 对照完成');
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, 'A/B 对照失败'));
        } finally {
            setComparing(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-start justify-between gap-4">
                <PageHeader
                    title="大脑系统提示词"
                    description="版本管理、发布、以及基于已有 taskId 的 A/B 对照（仅 Brain plan）"
                />
                <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    刷新
                </Button>
            </div>

            {(actionError || successMsg || error) && (
                <div className={`rounded-md border p-3 text-sm ${actionError || error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
                    {actionError || (error ? '数据加载失败' : '') ? (
                        <span>{actionError || '数据加载失败'}</span>
                    ) : (
                        <span className="inline-flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            {successMsg}
                        </span>
                    )}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <ActiveVersionCard
                    activeRef={activeData?.ref || null}
                    activeVersion={activeData?.version || null}
                    onLoadToEditor={loadVersionToEditor}
                    onSetA={setVersionA}
                    onSetB={setVersionB}
                />

                <PromptEditor
                    note={note}
                    content={editorContent}
                    loading={actionLoading}
                    onNoteChange={setNote}
                    onContentChange={setEditorContent}
                    onSave={createVersion}
                />
            </div>

            <VersionHistory
                versions={versionsData?.versions || []}
                onLoadToEditor={loadVersionToEditor}
                onSetA={setVersionA}
                onSetB={setVersionB}
                onPublish={publishExisting}
            />

            <ABTestPanel
                taskId={taskId}
                versionA={versionA}
                versionB={versionB}
                comparing={comparing}
                result={compareResult}
                onTaskIdChange={setTaskId}
                onVersionAChange={setVersionA}
                onVersionBChange={setVersionB}
                onRunCompare={runCompare}
            />
        </div>
    );
}
