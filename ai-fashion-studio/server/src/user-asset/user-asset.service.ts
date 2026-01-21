import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type UserAssetDto = {
  id: string;
  url: string;
  sha256: string;
  cosKey?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  createdAt: number;
  deletedAt?: number;
};

export type CreateUserAssetInput = {
  url: string;
  sha256: string;
  cosKey?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
};

@Injectable()
export class UserAssetService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: {
    id: string;
    url: string;
    sha256: string;
    cosKey: string | null;
    fileName: string | null;
    mimeType: string | null;
    size: number | null;
    width: number | null;
    height: number | null;
    createdAt: Date;
    deletedAt: Date | null;
  }): UserAssetDto {
    return {
      id: row.id,
      url: row.url,
      sha256: row.sha256,
      cosKey: row.cosKey ?? undefined,
      fileName: row.fileName ?? undefined,
      mimeType: row.mimeType ?? undefined,
      size: row.size ?? undefined,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      createdAt: row.createdAt.getTime(),
      deletedAt: row.deletedAt ? row.deletedAt.getTime() : undefined,
    };
  }

  async listByUser(userId: string, page: number, limit: number) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 48;
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.userAsset.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.userAsset.count({
        where: { userId, deletedAt: null },
      }),
    ]);

    return {
      items: rows.map((row) => this.mapRow(row)),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async createMany(userId: string, items: CreateUserAssetInput[]) {
    const unique = new Map<string, CreateUserAssetInput>();
    for (const item of items) {
      const key = item.sha256;
      if (!unique.has(key)) unique.set(key, item);
    }

    const results: UserAssetDto[] = [];
    for (const item of unique.values()) {
      const row = await this.prisma.userAsset.upsert({
        where: {
          userId_sha256: {
            userId,
            sha256: item.sha256,
          },
        },
        create: {
          id: crypto.randomUUID(),
          userId,
          sha256: item.sha256,
          url: item.url,
          cosKey: item.cosKey ?? null,
          fileName: item.fileName ?? null,
          mimeType: item.mimeType ?? null,
          size: item.size ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
        },
        update: {
          url: item.url,
          cosKey: item.cosKey ?? null,
          fileName: item.fileName ?? null,
          mimeType: item.mimeType ?? null,
          size: item.size ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          deletedAt: null,
        },
      });
      results.push(this.mapRow(row));
    }

    return results;
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.userAsset.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
}
