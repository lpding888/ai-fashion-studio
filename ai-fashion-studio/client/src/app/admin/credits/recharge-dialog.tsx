'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCredits } from '@/hooks/use-credits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Loader2, User } from 'lucide-react';
import { useSWRConfig } from 'swr';

interface RechargeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function RechargeDialog({ open, onOpenChange }: RechargeDialogProps) {
    const { user } = useAuth();
    const { adminRecharge } = useCredits();
    const { mutate } = useSWRConfig();

    const [targetUserId, setTargetUserId] = useState('');
    const [amount, setAmount] = useState<number>(100);
    const [reason, setReason] = useState('管理员手动充值');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleRecharge = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetUserId || !amount || amount <= 0) {
            toast({
                title: "参数错误",
                description: "请输入有效的用户ID和金额",
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await adminRecharge(targetUserId, Number(amount), reason);
            toast({
                title: "充值成功",
                description: `已为用户 ${targetUserId} 充值 ${amount} 积分`,
            });
            mutate((key: string) => key.includes('/api/credits'));
            onOpenChange(false);
        } catch (error: unknown) {
            const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
            const fallback = error instanceof Error ? error.message : "未知错误";
            toast({
                title: "充值失败",
                description: apiMessage || fallback || "未知错误",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const fillSelfId = () => {
        if (user?.id) {
            setTargetUserId(user.id);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>积分充值</DialogTitle>
                    <DialogDescription>
                        为指定用户直接增加积分余额。请谨慎操作。
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleRecharge} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="userId">目标用户 ID</Label>
                        <div className="flex gap-2">
                            <Input
                                id="userId"
                                placeholder="输入用户 UUID"
                                value={targetUserId}
                                onChange={(e) => setTargetUserId(e.target.value)}
                                required
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={fillSelfId}
                                title="给自己充值"
                            >
                                <User className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="amount">充值金额</Label>
                        <Input
                            id="amount"
                            type="number"
                            min="1"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reason">充值原因 (可选)</Label>
                        <Input
                            id="reason"
                            placeholder="例如：系统补偿、活动奖励"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    充值中...
                                </>
                            ) : (
                                '确认充值'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
