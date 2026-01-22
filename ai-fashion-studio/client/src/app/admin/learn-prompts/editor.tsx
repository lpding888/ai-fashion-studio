'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { ActiveRef } from './types';

interface EditorProps {
    note: string;
    styleLearnPrompt: string;
    poseLearnPrompt: string;
    loading: boolean;
    activeRef: ActiveRef | null;
    onNoteChange: (val: string) => void;
    onStylePromptChange: (val: string) => void;
    onPosePromptChange: (val: string) => void;
    onSave: (publish: boolean) => void;
    onRepublish: (id: string) => void;
}

export function Editor({
    note,
    styleLearnPrompt,
    poseLearnPrompt,
    loading,
    activeRef,
    onNoteChange,
    onStylePromptChange,
    onPosePromptChange,
    onSave,
    onRepublish
}: EditorProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>编辑器</CardTitle>
                <CardDescription>修改后可保存为新版本，并可选择发布</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>版本备注（可选）</Label>
                    <Input value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="例如：更严格的 JSON 指令" />
                </div>

                <div className="space-y-2">
                    <Label>风格学习提示词</Label>
                    <Textarea
                        value={styleLearnPrompt}
                        onChange={(e) => onStylePromptChange(e.target.value)}
                        className="min-h-[240px] font-mono text-xs"
                    />
                </div>

                <div className="space-y-2">
                    <Label>动作/姿势学习提示词</Label>
                    <Textarea
                        value={poseLearnPrompt}
                        onChange={(e) => onPosePromptChange(e.target.value)}
                        className="min-h-[240px] font-mono text-xs"
                    />
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button onClick={() => onSave(false)} disabled={loading} variant="outline" className="gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        保存版本
                    </Button>
                    <Button onClick={() => onSave(true)} disabled={loading} className="gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        保存并发布
                    </Button>
                    {activeRef?.versionId && (
                        <Button onClick={() => onRepublish(activeRef.versionId)} disabled={loading} variant="secondary">
                            重新发布当前 active
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
