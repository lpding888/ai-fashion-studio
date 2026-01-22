'use client';

/* eslint-disable @next/next/no-img-element */

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2 } from 'lucide-react';
import { StylePreset } from './style-edit-dialog';
import { BACKEND_ORIGIN } from '@/lib/api';

interface StyleCardProps {
    preset: StylePreset;
    onEdit: (preset: StylePreset) => void;
    onDelete: (id: string) => void;
}

export function StyleCard({ preset, onEdit, onDelete }: StyleCardProps) {
    return (
        <Card className="overflow-hidden hover:shadow-lg transition-all group">
            <div className="relative aspect-video bg-muted">
                {preset.thumbnailPath ? (
                    <img
                        src={`${BACKEND_ORIGIN}/${preset.thumbnailPath}`}
                        alt={preset.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                        无封面
                    </div>
                )}
                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 bg-white/90 hover:bg-white text-blue-600 hover:text-blue-700"
                        onClick={() => onEdit(preset)}
                    >
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8 bg-red-500/90 hover:bg-red-600 border-none"
                        onClick={() => onDelete(preset.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <CardHeader className="p-4">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-1" title={preset.name}>{preset.name}</CardTitle>
                </div>
                {preset.tags && preset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {preset.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
                        ))}
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-4 pt-0">
                {/* Analysis Chips */}
                {preset.analysis ? (
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                        <div className="bg-muted p-1 rounded px-2 truncate" title={`Vibe: ${preset.analysis.vibe}`}>✨ {preset.analysis.vibe}</div>
                        <div className="bg-muted p-1 rounded px-2 truncate" title={`Grade: ${preset.analysis.grading}`}>🎨 {preset.analysis.grading}</div>
                    </div>
                ) : (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {preset.description || "暂无描述"}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
