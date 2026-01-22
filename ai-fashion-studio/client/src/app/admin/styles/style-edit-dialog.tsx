'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { useSWRConfig } from 'swr';

export interface StylePreset {
    id: string;
    name: string;
    description: string;
    imagePaths: string[];
    thumbnailPath: string;
    tags?: string[];
    styleHint?: string;
    createdAt: number;
    analysis?: {
        vibe?: string;
        grading?: string;
    };
}

interface StyleEditDialogProps {
    preset: StylePreset | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function StyleEditDialog({ preset, open, onOpenChange }: StyleEditDialogProps) {
    const { toast } = useToast();
    const { mutate } = useSWRConfig();

    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [tags, setTags] = useState('');
    const [hint, setHint] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (preset) {
            setName(preset.name || '');
            setDesc(preset.description || '');
            setTags(preset.tags ? preset.tags.join(', ') : '');
            setHint(preset.styleHint || '');
        }
    }, [preset]);

    const handleUpdate = async () => {
        if (!preset) return;
        if (!name.trim()) {
            toast({ title: "名称不能为空", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const tagsArray = tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);

            await api.patch(`/style-presets/${preset.id}`, {
                name,
                description: desc,
                tags: JSON.stringify(tagsArray), // Sending as stringified JSON as per previous page logic analysis
                styleHint: hint
            });

            toast({ title: "更新成功" });
            mutate('/style-presets');
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ title: "更新失败", description: "请检查网络或参数", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>编辑风格预设</DialogTitle>
                    <DialogDescription>
                        调整 AI 自动生成的风格信息
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            名称
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="tags" className="text-right">
                            标签
                        </Label>
                        <Input
                            id="tags"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="逗号分隔"
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="desc" className="text-right mt-2">
                            描述
                        </Label>
                        <Textarea
                            id="desc"
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            className="col-span-3"
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="hint" className="text-right mt-2">
                            核心参数
                        </Label>
                        <Textarea
                            id="hint"
                            value={hint}
                            onChange={(e) => setHint(e.target.value)}
                            className="col-span-3 font-mono text-xs"
                            rows={4}
                            placeholder="Lighting, Scene, etc."
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleUpdate} disabled={isSubmitting}>保存修改</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
