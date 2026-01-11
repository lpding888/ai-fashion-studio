import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { DbSchema, TaskModel, FacePreset, StylePreset, User, CreditTransaction } from './models';

@Injectable()
export class DbService implements OnModuleInit {
  private logger = new Logger(DbService.name);
  private dbPath = path.resolve('./data/db.json');
  private data: DbSchema = {
    tasks: [],
    facePresets: [],
    stylePresets: [],
    users: [],
    creditTransactions: [],
  };

  async onModuleInit() {
    await this.init();
  }

  private async init() {
    try {
      await fs.ensureDir(path.dirname(this.dbPath));
      if (await fs.pathExists(this.dbPath)) {
        this.data = await fs.readJson(this.dbPath);
        // 兼容旧数据：自动添加缺失字段
        if (!this.data.facePresets) this.data.facePresets = [];
        if (!this.data.stylePresets) this.data.stylePresets = [];
        if (!this.data.users) this.data.users = [];
        if (!this.data.creditTransactions) this.data.creditTransactions = [];
        if (!this.data.tasks) this.data.tasks = [];

        // 兼容旧任务：补齐 workflow 相关字段（默认 legacy）
        this.data.tasks = (this.data.tasks || []).map((t: any) => {
          const workflow = (t.workflow as any) || 'legacy';
          const gridStatus =
            (t.gridStatus as any)
            || (t.gridImageUrl ? 'RENDERED' : undefined);
          return {
            ...t,
            workflow,
            autoApproveHero: t.autoApproveHero ?? false,
            heroShots: t.heroShots ?? [],
            gridStatus,
            heroHistory: t.heroHistory ?? [],
            gridHistory: t.gridHistory ?? [],
            storyboardHistory: t.storyboardHistory ?? [],
          };
        });

        await this.save();
        this.logger.log(
          `Database loaded. Tasks: ${this.data.tasks.length}, FacePresets: ${this.data.facePresets.length}, StylePresets: ${this.data.stylePresets.length}, Users: ${this.data.users.length}`,
        );
      } else {
        await this.save();
        this.logger.log(`Created new database at ${this.dbPath}`);
      }
    } catch (e) {
      this.logger.error('Failed to init DB', e);
    }
  }

  private async save() {
    await fs.writeJson(this.dbPath, this.data, { spaces: 2 });
  }

  // ===== Task Operations =====

  async saveTask(task: TaskModel) {
    const index = this.data.tasks.findIndex((t) => t.id === task.id);
    if (index >= 0) {
      this.data.tasks[index] = task;
    } else {
      this.data.tasks.push(task);
    }
    await this.save();
    return task;
  }

  async getTask(id: string): Promise<TaskModel | null> {
    return this.data.tasks.find((t) => t.id === id) || null;
  }

  async getAllTasks(): Promise<TaskModel[]> {
    return this.data.tasks || [];
  }

  async updateTask(id: string, partial: Partial<TaskModel>) {
    const task = await this.getTask(id);
    if (!task) return null;
    Object.assign(task, partial);
    await this.saveTask(task);
    return task;
  }

  async deleteTask(id: string): Promise<boolean> {
    const index = this.data.tasks.findIndex((t) => t.id === id);
    if (index >= 0) {
      this.data.tasks.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  // ===== Face Preset Operations =====

  async saveFacePreset(preset: FacePreset) {
    const index = this.data.facePresets.findIndex((p) => p.id === preset.id);
    if (index >= 0) {
      this.data.facePresets[index] = preset;
    } else {
      this.data.facePresets.push(preset);
    }
    await this.save();
    return preset;
  }

  async getAllFacePresets(): Promise<FacePreset[]> {
    return this.data.facePresets || [];
  }

  async getFacePreset(id: string): Promise<FacePreset | null> {
    return this.data.facePresets.find((p) => p.id === id) || null;
  }

  async updateFacePreset(id: string, partial: Partial<FacePreset>) {
    const preset = await this.getFacePreset(id);
    if (!preset) return null;
    Object.assign(preset, partial);
    await this.saveFacePreset(preset);
    return preset;
  }

  async deleteFacePreset(id: string) {
    const index = this.data.facePresets.findIndex((p) => p.id === id);
    if (index >= 0) {
      this.data.facePresets.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  // ===== Style Preset Operations =====

  async saveStylePreset(preset: StylePreset) {
    const index = this.data.stylePresets.findIndex((p) => p.id === preset.id);
    if (index >= 0) {
      this.data.stylePresets[index] = preset;
    } else {
      this.data.stylePresets.push(preset);
    }
    await this.save();
    return preset;
  }

  async getAllStylePresets(): Promise<StylePreset[]> {
    return this.data.stylePresets || [];
  }

  async getStylePreset(id: string): Promise<StylePreset | null> {
    return this.data.stylePresets.find((p) => p.id === id) || null;
  }

  async updateStylePreset(id: string, partial: Partial<StylePreset>) {
    const preset = await this.getStylePreset(id);
    if (!preset) return null;
    Object.assign(preset, partial);
    await this.saveStylePreset(preset);
    return preset;
  }

  async deleteStylePreset(id: string) {
    const index = this.data.stylePresets.findIndex((p) => p.id === id);
    if (index >= 0) {
      this.data.stylePresets.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  // ===== User Operations =====

  async saveUser(user: User): Promise<User> {
    const index = this.data.users.findIndex((u) => u.id === user.id);
    if (index >= 0) {
      this.data.users[index] = user;
    } else {
      this.data.users.push(user);
    }
    await this.save();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return this.data.users || [];
  }

  async getUser(id: string): Promise<User | null> {
    return this.data.users.find((u) => u.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.data.users.find((u) => u.email === email) || null;
  }

  async updateUser(id: string, partial: Partial<User>) {
    const user = await this.getUser(id);
    if (!user) return null;
    Object.assign(user, partial);
    await this.saveUser(user);
    return user;
  }

  async deleteUser(id: string) {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index >= 0) {
      this.data.users.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  // ===== Credit Transaction Operations =====

  async getCreditTransactions(userId: string): Promise<CreditTransaction[]> {
    return this.data.creditTransactions.filter((t) => t.userId === userId);
  }

  async saveCreditTransaction(transaction: CreditTransaction): Promise<CreditTransaction> {
    this.data.creditTransactions.push(transaction);
    await this.save();
    return transaction;
  }

  async getAllCreditTransactions(): Promise<CreditTransaction[]> {
    return this.data.creditTransactions || [];
  }
}
