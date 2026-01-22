'use client';

import * as React from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/admin/shared/page-header';
import { CheckCircle2, Loader2, RefreshCw, Save } from 'lucide-react';
import { BrainRoutingConfig } from './types';
import { ActiveMap, ModelProfilePublic, ModelProvider } from '../model-profiles/types';

const fetcher = (url: string) => api.get(url).then(res => res.data);

const AUTO_DEFAULT = '__auto_default__';
const FOLLOW_DEFAULT = '__follow_default__';

const providerLabels: Record<ModelProvider, string> = {
    GEMINI: 'Gemini',
    OPENAI_COMPAT: 'OpenAI 兼容',
};

const formatProfileLabel = (p: ModelProfilePublic) => {
    const providerLabel = providerLabels[p.provider] || p.provider;
    return `${p.name} · ${providerLabel} · ${p.model}`;
};

export default function BrainRoutingPage() {
    const {
        data: routingData,
        error: routingError,
        mutate: mutateRouting,
        isLoading: routingLoading,
    } = useSWR<{ routing: BrainRoutingConfig }>('/admin/brain-routing', fetcher);

    const {
        data: profilesData,
        error: profilesError,
        mutate: mutateProfiles,
        isLoading: profilesLoading,
    } = useSWR<{ profiles: ModelProfilePublic[]; active: ActiveMap }>('/admin/model-profiles', fetcher);

    const isLoading = routingLoading || profilesLoading;
    const error = routingError || profilesError;

    const [actionLoading, setActionLoading] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    const [defaultBrainId, setDefaultBrainId] = React.useState<string>(AUTO_DEFAULT);
    const [styleLearnId, setStyleLearnId] = React.useState<string>(FOLLOW_DEFAULT);
    const [poseLearnId, setPoseLearnId] = React.useState<string>(FOLLOW_DEFAULT);
    const [promptOptimizeId, setPromptOptimizeId] = React.useState<string>(FOLLOW_DEFAULT);

    React.useEffect(() => {
        if (!routingData?.routing) return;
        setDefaultBrainId(routingData.routing.defaultBrainProfileId || AUTO_DEFAULT);
        setStyleLearnId(routingData.routing.styleLearnProfileId || FOLLOW_DEFAULT);
        setPoseLearnId(routingData.routing.poseLearnProfileId || FOLLOW_DEFAULT);
        setPromptOptimizeId(routingData.routing.promptOptimizeProfileId || FOLLOW_DEFAULT);
    }, [routingData]);

    const brainProfiles = React.useMemo(
        () => (profilesData?.profiles || []).filter((p) => p.kind === 'BRAIN'),
        [profilesData],
    );

    const activeBrainId = profilesData?.active?.BRAIN;

    const getErrorMessage = (e: unknown) => {
        if (typeof e === 'object' && e !== null) {
            const response = (e as { response?: { data?: { message?: string } } })?.response;
            const msg = response?.data?.message;
            if (typeof msg === 'string') return msg;
        }
        return e instanceof Error ? e.message : 'Unknown error';
    };

    const handleRefresh = () => {
        mutateRouting();
        mutateProfiles();
        setSuccessMsg('已刷新');
        setTimeout(() => setSuccessMsg(null), 2000);
    };

    const toPayloadValue = (value: string, fallback: string) => (value === fallback ? '' : value);

    const handleSave = async () => {
        setActionError(null);
        setSuccessMsg(null);
        setActionLoading(true);
        try {
            await api.post('/admin/brain-routing', {
                defaultBrainProfileId: toPayloadValue(defaultBrainId, AUTO_DEFAULT),
                styleLearnProfileId: toPayloadValue(styleLearnId, FOLLOW_DEFAULT),
                poseLearnProfileId: toPayloadValue(poseLearnId, FOLLOW_DEFAULT),
                promptOptimizeProfileId: toPayloadValue(promptOptimizeId, FOLLOW_DEFAULT),
            });
            setSuccessMsg('已更新大脑路由配置');
            mutateRouting();
        } catch (e: unknown) {
            setActionError(getErrorMessage(e));
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="大脑路由"
                    description="为风格学习、姿势学习、提示词优化指定独立模型，默认回退到当前生效的 Brain。"
                />
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleRefresh} disabled={isLoading || actionLoading} className="gap-2">
                        {(isLoading || actionLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        刷新
                    </Button>
                    <Button onClick={handleSave} disabled={actionLoading} className="gap-2">
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        保存
                    </Button>
                </div>
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

            <Card className="bg-blue-50/50 border-blue-100">
                <CardHeader>
                    <CardTitle className="text-base text-blue-900">路由策略</CardTitle>
                    <CardDescription className="text-blue-700">
                        默认大脑为空时使用当前生效的 Brain（{activeBrainId ? `ID: ${activeBrainId.slice(0, 8)}` : '未设置'}）。
                        若所选模型不可用，将自动回退默认大脑。
                    </CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>功能绑定</CardTitle>
                    <CardDescription>每个功能可单独选择模型，支持随时调整。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">默认大脑</div>
                        <Select value={defaultBrainId} onValueChange={setDefaultBrainId}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择默认大脑" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={AUTO_DEFAULT}>跟随当前生效 Brain</SelectItem>
                                {brainProfiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id} disabled={!!p.disabled}>
                                        {formatProfileLabel(p)}{p.disabled ? '（禁用）' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">风格学习</div>
                        <Select value={styleLearnId} onValueChange={setStyleLearnId}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择风格学习模型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FOLLOW_DEFAULT}>跟随默认大脑</SelectItem>
                                {brainProfiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id} disabled={!!p.disabled}>
                                        {formatProfileLabel(p)}{p.disabled ? '（禁用）' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">姿势学习</div>
                        <Select value={poseLearnId} onValueChange={setPoseLearnId}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择姿势学习模型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FOLLOW_DEFAULT}>跟随默认大脑</SelectItem>
                                {brainProfiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id} disabled={!!p.disabled}>
                                        {formatProfileLabel(p)}{p.disabled ? '（禁用）' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">提示词优化</div>
                        <Select value={promptOptimizeId} onValueChange={setPromptOptimizeId}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择提示词优化模型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FOLLOW_DEFAULT}>跟随默认大脑</SelectItem>
                                {brainProfiles.map((p) => (
                                    <SelectItem key={p.id} value={p.id} disabled={!!p.disabled}>
                                        {formatProfileLabel(p)}{p.disabled ? '（禁用）' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
