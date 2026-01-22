'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, GitCompare } from 'lucide-react';
import { CompareResult, CompareShot } from './types';

interface ABTestPanelProps {
    taskId: string;
    versionA: string;
    versionB: string;
    comparing: boolean;
    result: CompareResult | null;
    onTaskIdChange: (val: string) => void;
    onVersionAChange: (val: string) => void;
    onVersionBChange: (val: string) => void;
    onRunCompare: () => void;
}

export function ABTestPanel({
    taskId,
    versionA,
    versionB,
    comparing,
    result,
    onTaskIdChange,
    onVersionAChange,
    onVersionBChange,
    onRunCompare,
}: ABTestPanelProps) {

    const shotsRows = React.useMemo(() => {
        const planA = result?.planA;
        const planB = result?.planB;
        const shotsA: CompareShot[] = Array.isArray(planA?.shots) ? planA.shots : [];
        const shotsB: CompareShot[] = Array.isArray(planB?.shots) ? planB.shots : [];

        const indexB = new Map<string, CompareShot>();
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
    }, [result]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>A/B 对照（taskId）</CardTitle>
                <CardDescription>同一 taskId，分别用版本 A/B 生成 Brain plan，用于对照 prompt 与镜头策略</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-1">
                        <Label>taskId</Label>
                        <Input value={taskId} onChange={(e) => onTaskIdChange(e.target.value)} placeholder="例如：f3c2...（完整ID）" />
                    </div>
                    <div className="space-y-2">
                        <Label>版本 A</Label>
                        <Input value={versionA} onChange={(e) => onVersionAChange(e.target.value)} placeholder="从上方复制版本ID" />
                    </div>
                    <div className="space-y-2">
                        <Label>版本 B</Label>
                        <Input value={versionB} onChange={(e) => onVersionBChange(e.target.value)} placeholder="从上方复制版本ID" />
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button onClick={onRunCompare} disabled={comparing}>
                        {comparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompare className="mr-2 h-4 w-4" />}
                        运行对比
                    </Button>
                </div>

                {result?.success && (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Plan A</CardTitle>
                                <CardDescription>版本：<code>{result.metaA?.versionId}</code></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(result.planA, null, 2)}</pre>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Plan B</CardTitle>
                                <CardDescription>版本：<code>{result.metaB?.versionId}</code></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(result.planB, null, 2)}</pre>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {result?.success && shotsRows.length > 0 && (
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
                                    {shotsRows.map((r) => (
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
    );
}
