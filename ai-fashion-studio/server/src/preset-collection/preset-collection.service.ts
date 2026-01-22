import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DbService } from '../db/db.service';
import { PrismaService } from '../prisma/prisma.service';

export type PresetCollectionDto = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

@Injectable()
export class PresetCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: DbService,
  ) {}

  private mapRow(row: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): PresetCollectionDto {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      deletedAt: row.deletedAt ? row.deletedAt.getTime() : undefined,
    };
  }

  async listByUser(userId: string) {
    const rows = await this.prisma.presetCollection.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapRow(row));
  }

  async create(userId: string, name: string) {
    const trimmed = name.trim();
    const existing = await this.prisma.presetCollection.findFirst({
      where: { userId, name: trimmed },
    });
    if (existing) {
      if (existing.deletedAt) {
        await this.prisma.presetCollection.delete({
          where: { id: existing.id },
        });
      } else {
        throw new BadRequestException('收藏夹名称已存在');
      }
    }

    const row = await this.prisma.presetCollection.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        name: trimmed,
      },
    });
    return this.mapRow(row);
  }

  async rename(userId: string, id: string, name: string) {
    const trimmed = name.trim();
    const existing = await this.prisma.presetCollection.findFirst({
      where: {
        userId,
        name: trimmed,
        NOT: { id },
      },
    });
    if (existing) {
      if (existing.deletedAt) {
        await this.prisma.presetCollection.delete({
          where: { id: existing.id },
        });
      } else {
        throw new BadRequestException('收藏夹名称已存在');
      }
    }

    const result = await this.prisma.presetCollection.updateMany({
      where: { id, userId, deletedAt: null },
      data: { name: trimmed },
    });
    if (!result.count) return null;

    const row = await this.prisma.presetCollection.findUnique({ where: { id } });
    return row ? this.mapRow(row) : null;
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.presetCollection.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return false;

    await this.removeCollectionFromPresets(userId, id);
    await this.prisma.presetCollection.delete({ where: { id: existing.id } });
    return true;
  }

  private stripCollectionId(
    ids: string[] | undefined,
    targetId: string,
  ): string[] {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const next = ids.filter((item) => item !== targetId);
    return Array.from(new Set(next));
  }

  private async removeCollectionFromPresets(userId: string, collectionId: string) {
    const stylePresets = await this.db.getAllStylePresets();
    const facePresets = await this.db.getAllFacePresets();

    for (const preset of stylePresets) {
      if (preset.userId !== userId) continue;
      if (!Array.isArray(preset.collectionIds)) continue;
      if (!preset.collectionIds.includes(collectionId)) continue;
      const nextIds = this.stripCollectionId(
        preset.collectionIds,
        collectionId,
      );
      await this.db.saveStylePreset({
        ...preset,
        collectionIds: nextIds.length ? nextIds : undefined,
      });
    }

    for (const preset of facePresets) {
      if (preset.userId !== userId) continue;
      if (!Array.isArray(preset.collectionIds)) continue;
      if (!preset.collectionIds.includes(collectionId)) continue;
      const nextIds = this.stripCollectionId(
        preset.collectionIds,
        collectionId,
      );
      await this.db.saveFacePreset({
        ...preset,
        collectionIds: nextIds.length ? nextIds : undefined,
      });
    }
  }
}
