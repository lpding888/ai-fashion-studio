'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCredits } from '@/hooks/use-credits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Coins, User } from 'lucide-react';

export default function AdminCreditsPage() {
    const { user } = useAuth();
    const { adminRecharge } = useCredits();

    // Form states
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
            // 重置部分表单，保留ID方便连续操作？还是清空？还是保留？
            // 个人偏好：不清空ID，方便再次操作，也不清空金额。
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
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">积分管理</h2>
                <p className="text-muted-foreground">
                    管理用户积分、充值及查看流水。
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Coins className="h-5 w-5 text-amber-500" />
                            积分充值
                        </CardTitle>
                        <CardDescription>
                            为指定用户直接增加积分余额。请谨慎操作。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleRecharge} className="space-y-4">
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
                                        onClick={fillSelfId}
                                        title="给自己充值"
                                    >
                                        <User className="h-4 w-4 mr-2" />
                                        我自己
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

                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        充值中...
                                    </>
                                ) : (
                                    '确认充值'
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* 可以在这里添加另一个Card显示系统总积分概览，或者最近的充值记录 */}
                <Card className="bg-muted/10 border-dashed">
                    <CardHeader>
                        <CardTitle>使用说明</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                        <p>1. 用户ID必须是系统中的有效UUID。</p>
                        <p>2. 充值立即生效，用户刷新页面即可看到余额更新。</p>
                        <p>3. 所有充值操作都会记录在后台审计日志中。</p>
                        <p>4. 给自己充值主要用于测试目的。</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
