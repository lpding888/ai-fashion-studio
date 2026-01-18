
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, Plus as PlusIcon, BrainCircuit, CheckCircle2 } from 'lucide-react';
import { learnStyle } from '@/lib/api';
import { cn } from '@/lib/utils';

interface StyleAnalyzerProps {
    onAnalysisComplete?: (preset: any, files: File[]) => void;
    className?: string;
    compact?: boolean;
}

export function StyleAnalyzer({ onAnalysisComplete, className, compact = false }: StyleAnalyzerProps) {
    const [isLearning, setIsLearning] = useState(false);
    const [selectedImages, setSelectedImages] = useState<File[]>([]);
    const [learnedPreset, setLearnedPreset] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    const addImages = (newFiles: File[]) => {
        setSelectedImages(prev => {
            const combined = [...prev, ...newFiles];
            if (combined.length > 5) {
                setError("最多支持上传 5 张参考图");
                return combined.slice(0, 5);
            }
            if (newFiles.length > 0) {
                setLearnedPreset(null);
                setError(null);
            }
            return combined;
        });
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
            addImages(newFiles);
            // Reset input value to allow selecting same files again if needed
            e.target.value = '';
        }
    };

    const removeImage = (index: number) => {
        setSelectedImages(prev => {
            const next = [...prev];
            next.splice(index, 1);
            if (next.length === 0) {
                setLearnedPreset(null);
            }
            return next;
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            addImages(newFiles);
        }
    };

    const startLearning = async () => {
        if (selectedImages.length === 0) return;

        setIsLearning(true);
        setError(null);

        try {
            const result = await learnStyle(selectedImages);
            const failed = result?.success === false || result?.preset?.learnStatus === 'FAILED';
            if (failed) {
                setError('风格学习失败（模型返回为空），请重试');
                setLearnedPreset(null);
                return;
            }
            setLearnedPreset(result.preset);
            if (onAnalysisComplete) {
                onAnalysisComplete(result.preset, selectedImages);
            }
        } catch (err: any) {
            console.error('Learning failed', err);
            setError(err.message || '风格学习失败，请稍后重试');
        } finally {
            setIsLearning(false);
        }
    };

    return (
        <Card className={cn("w-full transition-all bg-white/5 border-white/10 backdrop-blur-sm", learnedPreset ? "bg-emerald-500/10 border-emerald-500/30" : "border-dashed", className)}>
            <CardHeader className={compact ? "p-3 pb-0" : "pb-2"}>
                <CardTitle className="text-sm font-bold flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-pink-500" />
                        AI 风格学习
                    </div>
                    {selectedImages.length > 0 && !learnedPreset && (
                        <span className="text-xs text-slate-400 font-mono">{selectedImages.length}/5 张</span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className={compact ? "p-3 pt-2" : "space-y-4"}>
                {selectedImages.length === 0 ? (
                    // 1. Upload State (Empty)
                    <div
                        className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer relative group"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleImageSelect}
                            accept="image/*"
                            multiple
                        />
                        <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-slate-200 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <Upload className="w-5 h-5" />
                            </div>
                            <p className="text-xs font-medium">点击或拖拽上传参考图</p>
                            <p className="text-[10px] opacity-70">支持 JPG/PNG (最多5张)</p>
                        </div>
                    </div>
                ) : !learnedPreset ? (
                    // 2. Preview & Action State
                    <div className="space-y-4">
                        {/* Grid Preview */}
                        <div className="grid grid-cols-3 gap-2">
                            {selectedImages.map((file, index) => (
                                <div key={index} className="relative aspect-square group rounded-lg overflow-hidden border border-white/10 shadow-sm">
                                    <img
                                        src={URL.createObjectURL(file)}
                                        alt={`Preview ${index}`}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                    />
                                    <button
                                        onClick={() => removeImage(index)}
                                        className="absolute top-1 right-1 bg-black/50 backdrop-blur-md text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                                        title="移除"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                    </button>
                                </div>
                            ))}
                            {selectedImages.length < 5 && (
                                <label className="flex items-center justify-center border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:bg-white/5 aspect-square transition-all group">
                                    <PlusIcon className="w-5 h-5 text-slate-500 group-hover:text-slate-300" />
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={handleImageSelect}
                                        accept="image/*"
                                        multiple
                                    />
                                </label>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={startLearning}
                                disabled={isLearning}
                                className="flex-1 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-lg shadow-orange-500/20 border-0"
                                size="sm"
                            >
                                {isLearning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        学习中...
                                    </>
                                ) : (
                                    <>
                                        <BrainCircuit className="w-4 h-4 mr-2" />
                                        开始学习并入库
                                    </>
                                )}
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSelectedImages([]);
                                    setLearnedPreset(null);
                                    setError(null);
                                }}
                                disabled={isLearning}
                                title="全部移除"
                                className="border-white/10 hover:bg-white/10 hover:text-white"
                            >
                                <span className="text-xs">清空</span>
                            </Button>
                        </div>
                        {error && <p className="text-xs text-rose-400 text-center bg-rose-500/10 py-1 rounded-md">{error}</p>}
                    </div>
                ) : ( // 3. Learning Result State
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-center gap-2 text-emerald-400 mb-2">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span className="font-bold">风格习得成功</span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">{learnedPreset.name}</h3>
                                <p className="text-xs text-slate-400 mb-3">{learnedPreset.description}</p>

                                <div className="flex flex-wrap gap-1 justify-center">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-emerald-200 border border-white/10">
                                        {learnedPreset.analysis.vibe}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-blue-200 border border-white/10">
                                        {learnedPreset.analysis.grading}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-slate-400 hover:text-white hover:bg-white/5"
                            onClick={() => {
                                setLearnedPreset(null);
                                setSelectedImages([]);
                            }}
                        >
                            开始新的学习
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
