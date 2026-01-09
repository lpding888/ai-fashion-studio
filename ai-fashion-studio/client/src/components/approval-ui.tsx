"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';
import { FadeIn } from '@/components/ui/motion';
import api from '@/lib/api';

type BrainShot = {
    prompt?: string;
    prompt_en?: string;
    type?: string;
    camera_angle?: string;
    lighting?: string;
    [key: string]: unknown;
};

type BrainPlan = {
    shots?: BrainShot[];
    [key: string]: unknown;
};

interface ApprovalUIProps {
    taskId: string;
    brainPlan: BrainPlan;
    onApproved: () => void;
}

export function ApprovalUI({ taskId, brainPlan, onApproved }: ApprovalUIProps) {
    const [approving, setApproving] = React.useState(false);

    const handleApprove = async () => {
        setApproving(true);
        try {
            await api.post(`/tasks/${taskId}/approve`, {});
            onApproved(); // Refresh parent
        } catch (err) {
            console.error('Failed to approve task', err);
            alert('批准失败，请重试');
        } finally {
            setApproving(false);
        }
    };

    return (
        <FadeIn delay={0.4}>
            <Card className="border-2 border-green-200 shadow-xl bg-gradient-to-br from-green-50 to-emerald-50 overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-green-500 to-emerald-500" />
                <CardHeader>
                     <CardTitle className="flex items-center gap-2 text-xl text-green-700">
                         <Check className="w-6 h-6" />
                         Brain 分析完成 - 请确认生图方案
                     </CardTitle>
                     <CardDescription>请查看AI生成的拍摄提示词，确认无误后点击“开始生图”</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-4">
                     {/* Display generated shots/prompts */}
                     <div>
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">
                            📸 生成的拍摄方案 ({brainPlan.shots?.length || 0} 个镜头)
                         </h4>
                         <div className="space-y-3">
                             {brainPlan.shots?.map((shot, i: number) => {
                                 const prompt = shot.prompt || shot.prompt_en || 'N/A';
                                 return (
                                     <Card key={i} className="bg-white border-green-100">
                                         <CardHeader className="pb-3">
                                             <div className="flex items-center justify-between">
                                                <CardTitle className="text-base">
                                                    Shot {i + 1}: {shot.type || '未知类型'}
                                                </CardTitle>
                                                <div className="flex gap-2">
                                                    {shot.camera_angle && (
                                                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                                            {shot.camera_angle}
                                                        </span>
                                                    )}
                                                    {shot.lighting && (
                                                        <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">
                                                            {shot.lighting}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-200 font-mono leading-relaxed">
                                                {prompt}
                                            </p>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-white/50 border-t border-green-100">
                    <Button
                        onClick={handleApprove}
                        disabled={approving}
                        size="lg"
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold"
                    >
                        {approving ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                正在提交...
                            </>
                        ) : (
                            <>
                                <Check className="mr-2 h-5 w-5" />
                                确认无误，开始生图
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </FadeIn>
    );
}
