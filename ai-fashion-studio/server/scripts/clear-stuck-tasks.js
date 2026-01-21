/**
 * 清理卡住的任务
 * 使用方法：cd server && node scripts/clear-stuck-tasks.js
 */

const { PrismaClient } = require('../generated/prisma/client');

async function clearStuckTasks() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 查找卡住的任务...');
    
    // 查找卡住的任务
    const stuckTasks = await prisma.task.findMany({
      where: {
        status: {
          in: ['PLANNING', 'AWAITING_APPROVAL', 'RENDERING']
        }
      },
      select: {
        id: true,
        status: true,
        userId: true,
        createdAt: true
      }
    });

    console.log(`\n📊 找到 ${stuckTasks.length} 个卡住的任务:`);
    stuckTasks.forEach(task => {
      console.log(`  - ${task.id}: ${task.status} (User: ${task.userId})`);
    });

    if (stuckTasks.length === 0) {
      console.log('\n✅ 没有发现卡住的任务');
      return;
    }

    console.log(`\n🧹 开始清理 ${stuckTasks.length} 个任务...`);

    // 更新任务状态为 FAILED
    const result = await prisma.task.updateMany({
      where: {
        status: {
          in: ['PLANNING', 'AWAITING_APPROVAL', 'RENDERING']
        }
      },
      data: {
        status: 'FAILED',
        error: 'Task reset due to stuck status'
      }
    });

    console.log(`\n✅ 成功清理 ${result.count} 个任务`);

    // 查看当前活动任务数量
    const activeTasks = await prisma.task.groupBy({
      by: ['status'],
      where: {
        status: {
          in: ['PLANNING', 'AWAITING_APPROVAL', 'RENDERING', 'QUEUED']
        }
      },
      _count: true
    });

    console.log('\n📊 当前活动任务统计:');
    activeTasks.forEach(item => {
      console.log(`  ${item.status}: ${item._count}`);
    });

    console.log('\n✅ 清理完成！现在可以重新创建任务了');
  } catch (error) {
    console.error('❌ 清理失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearStuckTasks()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
