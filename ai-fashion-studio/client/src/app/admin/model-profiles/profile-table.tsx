'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { CheckCircle2, Loader2, Pencil, Play, Plus, Trash2, XCircle } from 'lucide-react';
import { ModelProfilePublic, ModelProfileGroup } from './types';

interface ProfileTableProps {
    profiles: ModelProfilePublic[];
    activeId?: string;
    poolIds?: string[];
    loading: boolean;
    testingId: string | null;
    testResult: Record<string, { ok: boolean; message: string }>;
    onTest: (id: string) => void;
    onSetActive: (p: ModelProfilePublic) => void;
    onTogglePool: (p: ModelProfilePublic) => void;
    onEdit: (p: ModelProfilePublic) => void;
    onDelete: (p: ModelProfilePublic) => void;
    onAddKeys: (group: ModelProfileGroup, keys: string[]) => void;
}

export function ProfileTable({
    profiles,
    activeId,
    poolIds,
    loading,
    testingId,
    testResult,
    onTest,
    onSetActive,
    onTogglePool,
    onEdit,
    onDelete,
    onAddKeys
}: ProfileTableProps) {
    const [addingGroup, setAddingGroup] = React.useState<string | null>(null);
    const [addingKeysText, setAddingKeysText] = React.useState('');

    // Grouping Logic
    const grouped = React.useMemo(() => {
        const map = new Map<string, ModelProfileGroup>();
        for (const p of profiles) {
            const key = `${p.kind}|${p.provider}|${p.gateway}|${p.model}`;
            const existing = map.get(key);
            if (existing) {
                existing.profiles.push(p);
            } else {
                map.set(key, { kind: p.kind, provider: p.provider, gateway: p.gateway, model: p.model, profiles: [p] });
            }
        }
        return Array.from(map.values());
    }, [profiles]);

    const handleAddKeys = (group: ModelProfileGroup) => {
        const keys = addingKeysText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (keys.length > 0) {
            onAddKeys(group, keys);
            setAddingKeysText('');
            setAddingGroup(null);
        }
    };

    if (profiles.length === 0) {
        return <div className="text-sm text-muted-foreground p-4 text-center">暂无配置</div>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>网关</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>密钥</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {grouped.map((group) => {
                    const pool = (poolIds && poolIds.length > 0) ? poolIds : (activeId ? [activeId] : []);
                    const groupHasActive = !!activeId && group.profiles.some((p) => p.id === activeId);

                    // Sort: Active items first, then Pool items, then UpdatedAt
                    const sorted = [...group.profiles].sort((a, b) => {
                        const aPrimary = a.id === activeId ? 1 : 0;
                        const bPrimary = b.id === activeId ? 1 : 0;
                        if (aPrimary !== bPrimary) return bPrimary - aPrimary;
                        const aInPool = pool.includes(a.id) ? 1 : 0;
                        const bInPool = pool.includes(b.id) ? 1 : 0;
                        if (aInPool !== bInPool) return bInPool - aInPool;
                        return b.updatedAt - a.updatedAt;
                    });

                    const groupKey = `${group.kind}|${group.provider}|${group.gateway}|${group.model}`;
                    const isAdding = addingGroup === groupKey;

                    return (
                        <TableRow key={groupKey} className={groupHasActive ? 'bg-emerald-50/40' : undefined}>
                            <TableCell className="font-medium align-top">
                                <div className="flex flex-col gap-1">
                                    <span className="font-mono text-xs text-muted-foreground">{group.kind}</span>
                                    <span>{group.model}</span>
                                    <div className="flex gap-1 mt-1">
                                        {groupHasActive && <Badge variant="default" className="text-[10px] px-1 h-5">Current</Badge>}
                                        <Badge variant="secondary" className="text-[10px] px-1 h-5">{sorted.length} keys</Badge>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground align-top pt-4">
                                {group.provider}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate align-top pt-4">
                                {group.gateway}
                            </TableCell>
                            <TableCell className="font-mono text-xs align-top pt-4">{group.model}</TableCell>
                            <TableCell className="space-y-2 align-top">
                                {sorted.map((p) => {
                                    const isPrimary = p.id === activeId;
                                    const isInPool = pool.includes(p.id);
                                    const lastTest = testResult[p.id];
                                    return (
                                        <div key={p.id} className="rounded border border-border/60 p-2 bg-background/50 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs">{p.keyMasked}</span>
                                                        {isPrimary && <Badge variant="default" className="h-5 text-[10px]">Active</Badge>}
                                                        {!isPrimary && isInPool && <Badge variant="secondary" className="h-5 text-[10px]">Pool</Badge>}
                                                        {p.disabled && <Badge variant="outline" className="h-5 text-[10px]">Disabled</Badge>}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate mt-1" title={p.name}>{p.name}</div>
                                                </div>

                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onTest(p.id)} disabled={testingId === p.id} title="测试">
                                                        {testingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSetActive(p)} disabled={loading || isPrimary || !!p.disabled} title="设为主Key">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onTogglePool(p)} disabled={loading || !!p.disabled} title={isInPool ? '从池中移除' : '加入池'}>
                                                        {isInPool ? <XCircle className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(p)} title="编辑">
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => onDelete(p)} disabled={loading} title="删除">
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {lastTest && (
                                                <div className={`mt-2 text-xs flex items-center gap-1 ${lastTest.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                                                    {lastTest.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                    <span className="truncate max-w-[300px]">{lastTest.message}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {isAdding ? (
                                    <div className="rounded border border-dashed border-border p-3 bg-background/50 space-y-2">
                                        <div className="text-xs text-muted-foreground">粘贴 API Key（每行一个）</div>
                                        <Textarea
                                            value={addingKeysText}
                                            onChange={(e) => setAddingKeysText(e.target.value)}
                                            placeholder="sk-..."
                                            className="min-h-[80px] text-xs font-mono"
                                        />
                                        <div className="flex gap-2 justify-end">
                                            <Button variant="outline" size="sm" onClick={() => { setAddingGroup(null); setAddingKeysText(''); }}>取消</Button>
                                            <Button size="sm" onClick={() => handleAddKeys(group)} disabled={loading}>确认添加</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button variant="outline" size="sm" className="w-full h-8 text-xs dashed" onClick={() => { setAddingGroup(groupKey); setAddingKeysText(''); }}>
                                        <Plus className="h-3 w-3 mr-1" /> 添加更多 Key
                                    </Button>
                                )}
                            </TableCell>
                            <TableCell className="align-top pt-4">
                                <div className="text-xs text-muted-foreground">同一组共享 Provider / 网关 / 模型</div>
                            </TableCell>
                            <TableCell className="text-right align-top pt-4">
                                <div className="text-xs text-muted-foreground">-</div>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
