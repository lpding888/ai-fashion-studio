"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from 'react';
import { useStylePresetStore, StylePreset } from '@/store/style-preset-store';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Edit2, Check, Loader2, Images, FolderOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import api from '@/lib/api';
import { StyleAnalyzer } from './style-analyzer';

interface StylePresetSelectorProps {
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    maxSelection?: number;
    mode?: 'single' | 'multiple';
    hideCreateButton?: boolean; // 新增：控制是否隐藏创建按钮
}

export function StylePresetSelector({ selectedIds, onSelect, maxSelection = 3, mode = 'multiple', hideCreateButton = false }: StylePresetSelectorProps) {
    const { presets, loading, fetchPresets, updatePreset, deletePreset } = useStylePresetStore();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        fetchPresets();
    }, [fetchPresets]);

    const handleToggleSelect = (id: string) => {
        if (mode === 'single') {
            onSelect([id]);
        } else {
            if (selectedIds.includes(id)) {
                onSelect(selectedIds.filter(sid => sid !== id));
            } else {
                if (selectedIds.length < maxSelection) {
                    onSelect([...selectedIds, id]);
                } else {
                    alert(`最多只能选择 ${maxSelection} 个预设`);
                }
            }
        }
    };

    // Removed handleFileChange and handleAddPreset

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('确定要删除这个风格预设吗？')) return;
        try {
            await deletePreset(id);
        } catch (error) {
            console.error(error);
            alert('删除失败');
        }
    };

    const startEdit = (e: React.MouseEvent, preset: StylePreset) => {
        e.stopPropagation();
        setEditingId(preset.id);
        setEditName(preset.name);
    };

    const saveEdit = async (e: React.SyntheticEvent) => {
        e.stopPropagation();
        if (!editName.trim()) {
            alert('名称不能为空');
            return;
        }
        try {
            await updatePreset(editingId!, { name: editName });
            setEditingId(null);
        } catch (error) {
            console.error(error);
            alert('更新失败');
        }
    };

    const getImageUrl = (path: string): string => {
        if (!path) return '/placeholder.png';
        const normalizedPath = path.replace(/\\/g, '/');
        if (normalizedPath.startsWith('http')) {
            return normalizedPath;
        }
        return `${api.defaults.baseURL}/${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1');
    };

    if (loading && presets.length === 0) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                <span className="ml-2 text-sm text-slate-400">加载中...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Add New Button - Styled as a premium action card */}
                {!hideCreateButton && (
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <motion.div
                                whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
                                whileTap={{ scale: 0.98 }}
                                className="aspect-square rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center cursor-pointer transition-colors group relative overflow-hidden"
                            >
                                <div className="w-12 h-12 rounded-full bg-white/10 group-hover:bg-orange-500 flex items-center justify-center mb-3 transition-colors border border-white/20 group-hover:border-orange-400 shadow-lg shadow-orange-500/0 group-hover:shadow-orange-500/50">
                                    <Plus className="w-6 h-6 text-white/70 group-hover:text-white transition-colors" />
                                </div>
                                <span className="text-xs text-slate-200 font-bold group-hover:text-white transition-colors">AI 风格学习</span>
                                <span className="text-[10px] text-slate-400 font-medium mt-1 group-hover:text-slate-200">AI 智能提取</span>

                                {/* Decorative background element */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </motion.div>
                        </DialogTrigger>
                        <DialogContent className="bg-slate-900 border-white/10 sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>AI 风格学习与入库</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <StyleAnalyzer
                                    onAnalysisComplete={() => {
                                        setIsAddDialogOpen(false);
                                        fetchPresets(); // Refresh list to show new preset
                                    }}
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Preset Items */}
                {presets.map((preset) => {
                    const isSelected = selectedIds.includes(preset.id);
                    const isEditing = editingId === preset.id;

                    return (
                        <motion.div
                            key={preset.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ y: -2 }}
                            onClick={() => handleToggleSelect(preset.id)}
                            className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer group transition-all duration-300 ${isSelected
                                ? 'ring-4 ring-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)] z-10 scale-[1.02]'
                                : 'ring-1 ring-white/10 hover:ring-white/30 hover:shadow-lg bg-black/20'
                                }`}
                        >
                            {/* Thumbnail Grid - Optimized */}
                            <div className="absolute inset-0 grid grid-cols-2 gap-px bg-black">
                                {preset.imagePaths.slice(0, 4).map((imgPath, idx) => {
                                    // Handle layout logic: 
                                    // 1 image: full
                                    // 2 images: split vertical
                                    // 3 images: 1 large left, 2 small right
                                    // For simplicity in this grid-cols-2:
                                    const count = preset.imagePaths.length;
                                    let spanClass = "";
                                    if (count === 1) spanClass = "col-span-2 row-span-2";
                                    else if (count === 2) spanClass = "row-span-2";
                                    else if (count === 3 && idx === 0) spanClass = "row-span-2";

                                    return (
                                        <div key={idx} className={`relative overflow-hidden ${spanClass}`}>
                                            <img
                                                src={getImageUrl(imgPath)}
                                                alt=""
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Overlay Gradient - Cleaner */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                            {/* Selection Checkmark - Premium Style */}
                            <AnimatePresence>
                                {isSelected && (
                                    <motion.div
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/40 z-20"
                                    >
                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Image Count Badge - Minimal */}
                            {!isSelected && preset.imagePaths.length > 1 && (
                                <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-white/10">
                                    <Images className="w-3 h-3 text-slate-200" />
                                    <span className="text-[10px] font-bold text-slate-200">{preset.imagePaths.length}</span>
                                </div>
                            )}

                            {/* Valid Hover Actions Overlay */}
                            <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => startEdit(e, preset)}
                                    className="h-7 w-7 rounded-full bg-black/50 hover:bg-white text-white hover:text-black backdrop-blur-md border border-white/10"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => handleDelete(e, preset.id)}
                                    className="h-7 w-7 rounded-full bg-black/50 hover:bg-red-500 text-white backdrop-blur-md border border-white/10"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </div>

                            {/* Name Label */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
                                {isEditing ? (
                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="h-7 text-xs bg-black/60 border-indigo-500/50 text-white focus:ring-1 focus:ring-indigo-500 pl-2 pr-1"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(e)}
                                        />
                                        <Button size="icon" variant="ghost" onClick={saveEdit} className="h-7 w-7 bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 rounded-md">
                                            <Check className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="text-white text-xs font-bold truncate tracking-wide shadow-sm">{preset.name}</h3>
                                        {preset.styleHint && (
                                            <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                                {preset.styleHint}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {presets.length === 0 && !loading && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FolderOpen className="w-8 h-8 text-slate-500 opacity-50" />
                    </div>
                    <p className="text-sm font-medium text-slate-400">空空如也</p>
                    <p className="text-xs text-slate-600 mt-1">创建您的第一个风格预设库</p>
                </div>
            )}
        </div>
    );
}
