'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/store/settings-store';

export default function UserSettingsPage() {
    const { autoApprove, setAutoApprove } = useSettingsStore();

    return (
        <div className="container py-8 max-w-3xl">
            <div className="mb-8">
                <h1 className="text-4xl font-bold tracking-tight">设置</h1>
                <p className="text-muted-foreground mt-2">仅保存个人偏好；模型/密钥由管理员在后台统一配置</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>工作流偏好</CardTitle>
                    <CardDescription>影响创建任务后的流程</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between gap-6">
                        <div className="space-y-1">
                            <Label>自动审批</Label>
                            <p className="text-xs text-muted-foreground">跳过 Brain 方案确认，直接开始出图</p>
                        </div>
                        <Button
                            variant={autoApprove ? 'default' : 'outline'}
                            onClick={() => setAutoApprove(!autoApprove)}
                        >
                            {autoApprove ? '已启用' : '已禁用'}
                        </Button>
                    </div>

                    <Separator />

                    <div className="text-xs text-muted-foreground">
                        提示：如果管理员未配置当前生效的 Brain/Painter 模型，本页不会生效，创建任务会提示需要管理员配置。
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
