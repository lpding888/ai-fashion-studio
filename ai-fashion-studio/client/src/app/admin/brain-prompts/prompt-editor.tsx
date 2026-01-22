'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save } from 'lucide-react';

interface PromptEditorProps {
    note: string;
    content: string;
    loading: boolean;
    onNoteChange: (val: string) => void;
    onContentChange: (val: string) => void;
    onSave: (publish: boolean) => void;
}

export function PromptEditor({
    note,
    content,
    loading,
    onNoteChange,
    onContentChange,
    onSave
}: PromptEditorProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>编辑器</CardTitle>
                <CardDescription>保存为新版本；可选择立即发布（立刻用于新任务）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>版本备注（可选）</Label>
                    <Input value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="例如：更强调镜头多样性" />
                </div>
                <div className="space-y-2">
                    <Label>系统提示词内容</Label>
                    <Textarea value={content} onChange={(e) => onContentChange(e.target.value)} className="min-h-[260px] font-mono text-xs" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onSave(false)} disabled={loading}>
                        <Save className="mr-2 h-4 w-4" />
                        保存为版本
                    </Button>
                    <Button onClick={() => onSave(true)} disabled={loading} className="bg-green-600 hover:bg-green-700">
                        <Save className="mr-2 h-4 w-4" />
                        保存并发布
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
