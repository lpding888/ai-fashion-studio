'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ActiveRef, PromptVersion } from './types';

interface ActiveVersionCardProps {
    activeRef: ActiveRef | null;
    activeVersion: PromptVersion | null;
    onLoadToEditor: (id: string) => void;
    onSetA: (id: string) => void;
    onSetB: (id: string) => void;
}

function formatTime(ms?: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('zh-CN');
}

export function ActiveVersionCard({
    activeRef,
    activeVersion,
    onLoadToEditor,
    onSetA,
    onSetB
}: ActiveVersionCardProps) {
    return (
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
                        onClick={() => activeRef?.versionId && onLoadToEditor(activeRef.versionId)}
                    >
                        加载到编辑器
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!activeRef?.versionId}
                        onClick={() => activeRef?.versionId && onSetA(activeRef.versionId)}
                    >
                        设为 A
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!activeRef?.versionId}
                        onClick={() => activeRef?.versionId && onSetB(activeRef.versionId)}
                    >
                        设为 B
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
