-- 清理卡住的任务状态
-- 将 PLANNING, AWAITING_APPROVAL, RENDERING 状态的任务重置为 FAILED
-- 这样可以让排队的任务开始执行

UPDATE "task"
SET 
    "status" = 'FAILED',
    "error" = 'Task reset due to stuck status'
WHERE "status" IN ('PLANNING', 'AWAITING_APPROVAL', 'RENDERING');

-- 查看被清理的任务数量
SELECT 'Cleaned ' || COUNT(*) || ' stuck tasks' as result FROM "task" WHERE "error" = 'Task reset due to stuck status';

-- 查看当前活动任务数量
SELECT 
    "status",
    COUNT(*) as count
FROM "task"
WHERE "status" IN ('PLANNING', 'AWAITING_APPROVAL', 'RENDERING', 'QUEUED')
GROUP BY "status";
