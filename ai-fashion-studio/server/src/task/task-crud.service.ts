import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DbService } from '../db/db.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskModel, UserModel } from '../db/models';

@Injectable()
export class TaskCrudService {
  private logger = new Logger(TaskCrudService.name);

  constructor(
    private readonly db: DbService,
    private readonly prisma: PrismaService,
  ) {}

  async getTask(id: string) {
    return this.db.getTask(id);
  }

  /**
   * Get all tasks with pagination
   */
  async getAllTasks(
    viewer: UserModel,
    page: number = 1,
    limit: number = 20,
    scope?: 'all' | 'mine',
    filters?: {
      userId?: string;
      q?: string;
      status?: string;
      directOnly?: boolean;
      favoriteOnly?: boolean;
    },
  ) {
    const allTasks = await this.db.getAllTasks();
    const isAdmin = viewer.role === 'ADMIN';

    const tasks = isAdmin
      ? scope === 'mine'
        ? allTasks.filter((t) => t.userId === viewer.id)
        : allTasks
      : allTasks.filter((t) => t.userId === viewer.id);

    // ADMIN only: optional filter by owner userId (口径：该用户所有任务)
    let filtered = tasks;
    if (isAdmin && filters?.userId) {
      filtered = filtered.filter((t) => t.userId === filters.userId);
    }

    if (filters?.status) {
      const status = String(filters.status).trim();
      if (status)
        filtered = filtered.filter((t) => String(t.status) === status);
    }

    if (filters?.q) {
      const q = String(filters.q).trim().toLowerCase();
      if (q) {
        filtered = filtered.filter((t) => {
          const hay = [String(t.id || ''), String(t.requirements || '')]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        });
      }
    }

    if (filters?.directOnly) {
      filtered = filtered.filter((t) => this.isDirectTask(t));
    }

    if (filters?.favoriteOnly) {
      filtered = filtered.filter((t) => typeof t.favoriteAt === 'number');
    }

    // Sort by creation time (newest first)
    const sortedTasks = filtered.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedTasks = sortedTasks.slice(start, end);

    return {
      tasks: paginatedTasks,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit),
    };
  }

  async claimTask(taskId: string, user: UserModel, claimToken: string) {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (task.userId) {
      if (task.userId === user.id || user.role === 'ADMIN') {
        return task;
      }
      throw new NotFoundException('任务不存在');
    }

    if (!task.claimTokenHash) {
      throw new BadRequestException('该任务无法认领');
    }

    const hash = crypto.createHash('sha256').update(claimToken).digest('hex');
    if (hash !== task.claimTokenHash) {
      throw new BadRequestException('认领凭证无效');
    }

    const updated = await this.db.updateTask(taskId, {
      userId: user.id,
      claimTokenHash: undefined,
    });

    if (!updated) {
      throw new NotFoundException('任务不存在');
    }

    return updated;
  }

  async countActiveLegacyTasksForUser(userId: string): Promise<number> {
    return this.prisma.task.count({
      where: {
        userId,
        status: { in: ['PLANNING', 'RENDERING'] },
      },
    });
  }

  /**
   * 删除任务及其相关文件
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const task = await this.db.getTask(taskId);
    if (!task) {
      this.logger.warn(`任务不存在: ${taskId}`);
      return false;
    }

    this.logger.log(`🗑️ 开始删除任务 ${taskId}...`);

    // 删除数据库记录
    const deleted = await this.db.deleteTask(taskId);

    if (deleted) {
      this.logger.log(`✅ 任务 ${taskId} 已删除`);
      // 删除任务不自动退款：避免“出图后删除=白嫖”；失败任务默认不会扣费。
    }

    return deleted;
  }

  async setTaskFavorite(taskId: string, favorite: boolean): Promise<TaskModel | null> {
    const task = await this.db.getTask(taskId);
    if (!task) return null;
    if (favorite) {
      task.favoriteAt = Date.now();
    } else {
      delete (task as Partial<TaskModel>).favoriteAt;
    }
    await this.db.saveTask(task);
    return task;
  }

  private isDirectTask(task: TaskModel) {
    const shots = Array.isArray(task.shots)
      ? (task.shots as Array<{ type?: string }>)
      : [];
    return (
      !!task.directPrompt ||
      task.scene === 'Direct' ||
      shots.some((shot) => shot?.type === 'DirectPrompt')
    );
  }
}
