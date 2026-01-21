import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreditTransaction,
  FacePreset,
  StylePreset,
  TaskModel,
  User,
} from './models';

@Injectable()
export class DbService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Task Operations =====

  async saveTask(task: TaskModel) {
    await this.prisma.task.upsert({
      where: { id: task.id },
      create: {
        id: task.id,
        userId: task.userId ?? null,
        status: task.status,
        creditsSpent: task.creditsSpent ?? null,
        createdAt: new Date(task.createdAt),
        data: task as any,
      },
      update: {
        userId: task.userId ?? null,
        status: task.status,
        creditsSpent: task.creditsSpent ?? null,
        createdAt: new Date(task.createdAt),
        data: task as any,
      },
    });

    return task;
  }

  async getTask(id: string): Promise<TaskModel | null> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    if (!row) return null;
    return row.data as any as TaskModel;
  }

  async getAllTasks(): Promise<TaskModel[]> {
    const rows = await this.prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.data as any as TaskModel);
  }

  async updateTask(id: string, partial: Partial<TaskModel>) {
    const task = await this.getTask(id);
    if (!task) return null;
    Object.assign(task, partial);
    await this.saveTask(task);
    return task;
  }

  async deleteTask(id: string): Promise<boolean> {
    try {
      await this.prisma.task.delete({ where: { id } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2025') return false;
      throw err;
    }
  }

  // ===== Face Preset Operations =====

  async saveFacePreset(preset: FacePreset) {
    await this.prisma.facePreset.upsert({
      where: { id: preset.id },
      create: {
        id: preset.id,
        name: preset.name,
        createdAt: new Date(preset.createdAt),
        data: preset as any,
      },
      update: {
        name: preset.name,
        createdAt: new Date(preset.createdAt),
        data: preset as any,
      },
    });

    return preset;
  }

  async getAllFacePresets(): Promise<FacePreset[]> {
    const rows = await this.prisma.facePreset.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.data as any as FacePreset);
  }

  async getFacePreset(id: string): Promise<FacePreset | null> {
    const row = await this.prisma.facePreset.findUnique({ where: { id } });
    if (!row) return null;
    return row.data as any as FacePreset;
  }

  async updateFacePreset(id: string, partial: Partial<FacePreset>) {
    const preset = await this.getFacePreset(id);
    if (!preset) return null;
    Object.assign(preset, partial);
    await this.saveFacePreset(preset);
    return preset;
  }

  async deleteFacePreset(id: string) {
    try {
      await this.prisma.facePreset.delete({ where: { id } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2025') return false;
      throw err;
    }
  }

  // ===== Style Preset Operations =====

  async saveStylePreset(preset: StylePreset) {
    await this.prisma.stylePreset.upsert({
      where: { id: preset.id },
      create: {
        id: preset.id,
        name: preset.name,
        createdAt: new Date(preset.createdAt),
        data: preset as any,
      },
      update: {
        name: preset.name,
        createdAt: new Date(preset.createdAt),
        data: preset as any,
      },
    });

    return preset;
  }

  async getAllStylePresets(): Promise<StylePreset[]> {
    const rows = await this.prisma.stylePreset.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => row.data as any as StylePreset);
  }

  async getStylePreset(id: string): Promise<StylePreset | null> {
    const row = await this.prisma.stylePreset.findUnique({ where: { id } });
    if (!row) return null;
    return row.data as any as StylePreset;
  }

  async updateStylePreset(id: string, partial: Partial<StylePreset>) {
    const preset = await this.getStylePreset(id);
    if (!preset) return null;
    Object.assign(preset, partial);
    await this.saveStylePreset(preset);
    return preset;
  }

  async deleteStylePreset(id: string) {
    try {
      await this.prisma.stylePreset.delete({ where: { id } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2025') return false;
      throw err;
    }
  }

  // ===== Panel User Operations (legacy) =====

  private mapPanelUser(row: {
    id: string;
    username: string;
    email: string;
    role: string;
    avatar: string | null;
    credits: number;
    totalTasks: number;
    createdAt: Date;
    lastLoginAt: Date | null;
    status: string;
    createdBy: string | null;
    notes: string | null;
  }): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as any,
      avatar: row.avatar ?? undefined,
      credits: row.credits,
      totalTasks: row.totalTasks,
      createdAt: row.createdAt.getTime(),
      lastLoginAt: row.lastLoginAt?.getTime(),
      status: row.status as any,
      createdBy: row.createdBy ?? undefined,
      notes: row.notes ?? undefined,
    };
  }

  async saveUser(user: User): Promise<User> {
    const row = await this.prisma.panelUser.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar ?? null,
        credits: user.credits,
        totalTasks: user.totalTasks,
        status: user.status,
        createdAt: new Date(user.createdAt),
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
        createdBy: user.createdBy ?? null,
        notes: user.notes ?? null,
      },
      update: {
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar ?? null,
        credits: user.credits,
        totalTasks: user.totalTasks,
        status: user.status,
        createdAt: new Date(user.createdAt),
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
        createdBy: user.createdBy ?? null,
        notes: user.notes ?? null,
      },
    });

    return this.mapPanelUser(row);
  }

  async getAllUsers(): Promise<User[]> {
    const rows = await this.prisma.panelUser.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapPanelUser(row));
  }

  async getUser(id: string): Promise<User | null> {
    const row = await this.prisma.panelUser.findUnique({ where: { id } });
    if (!row) return null;
    return this.mapPanelUser(row);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.panelUser.findUnique({ where: { email } });
    if (!row) return null;
    return this.mapPanelUser(row);
  }

  async updateUser(id: string, partial: Partial<User>) {
    const user = await this.getUser(id);
    if (!user) return null;
    Object.assign(user, partial);
    await this.saveUser(user);
    return user;
  }

  async deleteUser(id: string) {
    try {
      await this.prisma.panelUser.delete({ where: { id } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2025') return false;
      throw err;
    }
  }

  // ===== Credit Transaction Operations =====

  private mapCreditTransaction(row: {
    id: string;
    userId: string;
    type: 'EARN' | 'SPEND';
    amount: number;
    balance: number;
    reason: string;
    relatedTaskId: string | null;
    adminId: string | null;
    createdAt: Date;
  }): CreditTransaction {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      amount: row.amount,
      balance: row.balance,
      reason: row.reason,
      relatedTaskId: row.relatedTaskId ?? undefined,
      adminId: row.adminId ?? undefined,
      createdAt: row.createdAt.getTime(),
    };
  }

  async getCreditTransactions(userId: string): Promise<CreditTransaction[]> {
    const rows = await this.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapCreditTransaction(row as any));
  }

  async saveCreditTransaction(
    transaction: CreditTransaction,
  ): Promise<CreditTransaction> {
    const row = await this.prisma.creditTransaction.create({
      data: {
        id: transaction.id,
        userId: transaction.userId,
        type: transaction.type as any,
        amount: transaction.amount,
        balance: transaction.balance,
        reason: transaction.reason,
        relatedTaskId: transaction.relatedTaskId ?? null,
        adminId: transaction.adminId ?? null,
        createdAt: new Date(transaction.createdAt),
      },
    });
    return this.mapCreditTransaction(row as any);
  }

  async getAllCreditTransactions(): Promise<CreditTransaction[]> {
    const rows = await this.prisma.creditTransaction.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapCreditTransaction(row as any));
  }
}
