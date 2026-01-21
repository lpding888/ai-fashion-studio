import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Loader2, Clock, PlayCircle } from 'lucide-react';
import { GroupRunStatus } from './types';

export function StatusBadge({ status }: { status: GroupRunStatus }) {
    switch (status) {
        case 'DRAFT':
            return <Badge variant="outline" className="bg-white/5 border-white/10 text-white/50">待开始</Badge>;
        case 'CREATING':
            return <Badge className="bg-blue-500/20 text-blue-200 border border-blue-500/30 gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 创建中</Badge>;
        case 'QUEUED':
            return <Badge className="bg-amber-500/20 text-amber-200 border border-amber-500/30 gap-1"><Clock className="w-3 h-3" /> 排队中</Badge>;
        case 'PLANNING':
        // @ts-expect-error - Status might be from TaskStatus which is superset
        case 'AWAITING_APPROVAL':
            return <Badge className="bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 gap-1"><PlayCircle className="w-3 h-3" /> 规划中</Badge>;
        case 'RENDERING':
        // @ts-expect-error - Status might be from TaskStatus which is superset
        case 'HERO_RENDERING':
        // @ts-expect-error - Status might be from TaskStatus which is superset
        case 'SHOTS_RENDERING':
            return <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30 gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 生成中</Badge>;
        case 'RETRYING':
            return <Badge className="bg-orange-500/20 text-orange-200 border border-orange-500/30 gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 重试中</Badge>;
        case 'COMPLETED':
            return (
                <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 已完成
                </Badge>
            );
        case 'FAILED':
            return (
                <Badge className="bg-rose-500/20 text-rose-200 border border-rose-500/30 gap-1">
                    <AlertTriangle className="w-3 h-3" /> 失败
                </Badge>
            );
        default:
            return null;
    }
}
