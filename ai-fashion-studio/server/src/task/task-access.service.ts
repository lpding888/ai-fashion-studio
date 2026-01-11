import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserModel } from '../db/models';
import { DbService } from '../db/db.service';

@Injectable()
export class TaskAccessService {
  constructor(private readonly db: DbService) { }

  async requireReadableTask(taskId: string, user: UserModel) {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (user.role === 'ADMIN') {
      return task;
    }

    if (!task.userId || task.userId !== user.id) {
      // 避免泄露任务存在性：对外统一 404
      throw new NotFoundException('任务不存在');
    }

    return task;
  }

  async requireWritableTask(taskId: string, user: UserModel) {
    // 目前读写权限规则一致：管理员或任务 owner
    return this.requireReadableTask(taskId, user);
  }
}

