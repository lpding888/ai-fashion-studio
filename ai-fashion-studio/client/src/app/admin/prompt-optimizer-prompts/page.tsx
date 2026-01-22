'use client';

import * as React from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/shared/page-header';
import { ActiveRef, PromptVersion, PromptVersionMeta } from './types';
import { ActiveCard } from './active-card';
import { Editor } from './editor';
import { History } from './history';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function PromptOptimizerPromptsPage() {
    // ---- Data Fetching (Use SWR) ----
    const {
        data: activeData,
        error: activeError,
        mutate: mutateActive,
        isLoading: activeLoading
    } = useSWR<{ ref: ActiveRef; version: PromptVersion }>('/admin/prompt-optimizer-prompts/active', fetcher);

    const {
        data: versionsData,
        error: versionsError,
        mutate: mutateVersions,
        isLoading: versionsLoading
    } = useSWR<{ versions: PromptVersionMeta[] }>('/admin/prompt-optimizer-prompts/versions', fetcher);

    const isLoading = activeLoading || versionsLoading;
    const error = activeError || versionsError;

    // ---- Local State ----
    const [actionLoading, setActionLoading] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    // Editor state
    const [note, setNote] = React.useState('');
    const [optimizerSystemPrompt, setOptimizerSystemPrompt] = React.useState('');

    // Pre-fill editor when active version changes (only if empty to avoid overwrite)
    React.useEffect(() => {
        if (activeData?.version?.content && !optimizerSystemPrompt) {
            setOptimizerSystemPrompt(activeData.version.content);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const res = await api.get(`/admin/prompt-optimizer-prompts/versions/${id}`);
            const v: PromptVersion = res.data.version;
            setOptimizerSystemPrompt(v.content || '');
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
            const res = await api.post('/admin/prompt-optimizer-prompts/versions', {
                content: optimizerSystemPrompt,
                note,
                publish
            });
            const created: PromptVersionMeta = res.data.version;
            setSuccessMsg(publish ? `已发布新版本：${created.versionId.slice(0, 8)}` : `已保存版本：${created.versionId.slice(0, 8)}`);
            mutateActive();
            mutateVersions();
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, '保存失败'));
        } finally {
            setActionLoading(false);
        }
    };

    const publishVersion = async (versionId: string) => {
        setActionError(null);
        setSuccessMsg(null);
        setActionLoading(true);
        try {
            await api.post('/admin/prompt-optimizer-prompts/publish', { versionId });
            setSuccessMsg(`已发布版本：${versionId.slice(0, 8)}`);
            mutateActive();
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, '发布失败'));
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="提示词优化系统提示词"
                    description="管理 Learn 提示词自动优化的 system prompt 版本与发布"
                />
                <Button variant="outline" onClick={handleRefresh} disabled={isLoading} className="gap-2">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新
                </Button>
            </div>

            {(actionError || successMsg || error) && (
                <Card className={`border ${actionError || error ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                    <CardContent className={`p-4 ${actionError || error ? 'text-red-700' : 'text-green-700'} flex items-center gap-2`}>
                        {actionError || error ? (
                            <span>{actionError || '数据加载失败'}</span>
                        ) : (
                            <>
                                <CheckCircle2 className="h-4 w-4" />
                                {successMsg}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            <ActiveCard
                activeRef={activeData?.ref || null}
                activeVersion={activeData?.version || null}
            />

            <Editor
                note={note}
                optimizerSystemPrompt={optimizerSystemPrompt}
                loading={actionLoading}
                activeRef={activeData?.ref || null}
                onNoteChange={setNote}
                onPromptChange={setOptimizerSystemPrompt}
                onSave={createVersion}
                onRepublish={publishVersion}
            />

            <History
                versions={versionsData?.versions || []}
                activeRef={activeData?.ref || null}
                loading={actionLoading}
                onLoad={loadVersionToEditor}
                onPublish={publishVersion}
            />
        </div>
    );
}
