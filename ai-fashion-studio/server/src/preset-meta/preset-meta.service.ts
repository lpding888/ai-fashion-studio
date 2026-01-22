import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DbService } from '../db/db.service';
import type { FacePreset, StylePreset, UserModel } from '../db/models';

export type PresetKind = 'STYLE' | 'POSE' | 'FACE';
export type BatchMetaAction =
  | 'favorite'
  | 'unfavorite'
  | 'add-tags'
  | 'remove-tags'
  | 'set-tags'
  | 'add-collections'
  | 'remove-collections'
  | 'set-collections';

export type BatchMetaInput = {
  kind: PresetKind;
  ids: string[];
  action: BatchMetaAction;
  payload?: {
    tags?: string[];
    collectionIds?: string[];
  };
};

const TAG_MAX_COUNT = 20;

@Injectable()
export class PresetMetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: DbService,
  ) {}

  private normalizeList(items: string[] | undefined): string[] {
    if (!Array.isArray(items)) return [];
    const trimmed = items
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    return Array.from(new Set(trimmed));
  }

  private normalizeTags(
    items: string[] | undefined,
    options?: { enforceLimit?: boolean },
  ): string[] {
    const normalized = this.normalizeList(items);
    const dedup = new Map<string, string>();
    for (const tag of normalized) {
      const key = tag.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, tag);
    }
    const tags = Array.from(dedup.values());
    if ((options?.enforceLimit ?? true) && tags.length > TAG_MAX_COUNT) {
      throw new BadRequestException(`单个资源最多 ${TAG_MAX_COUNT} 个标签`);
    }
    return tags;
  }

  private requireOwnerOrAdmin(preset: { userId?: string }, user: UserModel, label: string) {
    if (!preset) throw new BadRequestException(`${label}不存在`);
    if (!preset.userId) {
      if (user.role !== 'ADMIN') {
        throw new BadRequestException(`需要管理员权限访问该${label}`);
      }
      return;
    }
    if (user.role === 'ADMIN') return;
    if (preset.userId !== user.id) {
      throw new BadRequestException(`无权访问该${label}`);
    }
  }

  private async ensureCollectionsOwned(userId: string, ids: string[]) {
    const unique = this.normalizeList(ids);
    if (!unique.length) return;
    const rows = await this.prisma.presetCollection.findMany({
      where: { userId, deletedAt: null, id: { in: unique } },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('收藏夹不存在');
    }
  }

  private applyFavorite(preset: StylePreset | FacePreset, value: boolean) {
    if (value) {
      preset.favoriteAt = Date.now();
    } else {
      delete preset.favoriteAt;
    }
  }

  private applyTags(
    preset: StylePreset | FacePreset,
    tags: string[],
    mode: 'add' | 'remove' | 'set',
  ) {
    const current = this.normalizeTags(preset.tags, { enforceLimit: false });
    const incoming = this.normalizeTags(tags);
    let next = current;
    if (mode === 'add') {
      next = this.normalizeTags([...current, ...incoming]);
    } else if (mode === 'remove') {
      const removeSet = new Set(incoming.map((tag) => tag.toLowerCase()));
      next = current.filter((tag) => !removeSet.has(tag.toLowerCase()));
    } else {
      next = this.normalizeTags(incoming);
    }
    if (next.length) preset.tags = next;
    else delete preset.tags;
  }

  private applyCollections(
    preset: StylePreset | FacePreset,
    collectionIds: string[],
    mode: 'add' | 'remove' | 'set',
  ) {
    const current = this.normalizeList(preset.collectionIds);
    const incoming = this.normalizeList(collectionIds);
    let next = current;
    if (mode === 'add') {
      next = Array.from(new Set([...current, ...incoming]));
    } else if (mode === 'remove') {
      const removeSet = new Set(incoming);
      next = current.filter((id) => !removeSet.has(id));
    } else {
      next = incoming;
    }
    if (next.length) preset.collectionIds = next;
    else delete preset.collectionIds;
  }

  private ensureKindMatch(preset: StylePreset, kind: PresetKind): boolean {
    if (kind === 'POSE') return preset.kind === 'POSE';
    if (kind === 'STYLE') return preset.kind !== 'POSE';
    return true;
  }

  async applyBatch(user: UserModel, input: BatchMetaInput) {
    const ids = this.normalizeList(input.ids);
    if (!ids.length) return [];
    const hasPayload = Object.prototype.hasOwnProperty.call(input, 'payload');
    const payload = input.payload ?? {};
    const hasTagsPayload =
      hasPayload && Object.prototype.hasOwnProperty.call(payload, 'tags');
    const hasCollectionsPayload =
      hasPayload &&
      Object.prototype.hasOwnProperty.call(payload, 'collectionIds');

    if (input.action === 'add-collections' || input.action === 'remove-collections') {
      const collectionIds = payload.collectionIds || [];
      if (!collectionIds.length) {
        throw new BadRequestException('收藏夹不能为空');
      }
      await this.ensureCollectionsOwned(user.id, collectionIds);
    }
    if (input.action === 'set-collections') {
      if (!hasCollectionsPayload) {
        throw new BadRequestException('收藏夹不能为空');
      }
      const collectionIds = payload.collectionIds || [];
      if (collectionIds.length) {
        await this.ensureCollectionsOwned(user.id, collectionIds);
      }
    }
    if (input.action === 'add-tags' || input.action === 'remove-tags') {
      const tags = payload.tags || [];
      if (!tags.length) {
        throw new BadRequestException('标签不能为空');
      }
      this.normalizeTags(tags);
    }
    if (input.action === 'set-tags') {
      if (!hasTagsPayload) {
        throw new BadRequestException('标签不能为空');
      }
      const tags = payload.tags || [];
      if (tags.length) this.normalizeTags(tags);
    }

    const updated: Array<StylePreset | FacePreset> = [];
    for (const id of ids) {
      if (input.kind === 'FACE') {
        const preset = await this.db.getFacePreset(id);
        if (!preset) continue;
        this.requireOwnerOrAdmin(preset, user, '人脸预设');
        if (input.action === 'favorite') this.applyFavorite(preset, true);
        if (input.action === 'unfavorite') this.applyFavorite(preset, false);
        if (input.action === 'add-tags') this.applyTags(preset, payload.tags || [], 'add');
        if (input.action === 'remove-tags') this.applyTags(preset, payload.tags || [], 'remove');
        if (input.action === 'set-tags') this.applyTags(preset, payload.tags || [], 'set');
        if (input.action === 'add-collections') this.applyCollections(preset, payload.collectionIds || [], 'add');
        if (input.action === 'remove-collections') this.applyCollections(preset, payload.collectionIds || [], 'remove');
        if (input.action === 'set-collections') this.applyCollections(preset, payload.collectionIds || [], 'set');
        await this.db.saveFacePreset(preset);
        updated.push(preset);
        continue;
      }

      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if (!this.ensureKindMatch(preset, input.kind)) continue;
      this.requireOwnerOrAdmin(preset, user, input.kind === 'POSE' ? '姿势预设' : '风格预设');
      if (input.action === 'favorite') this.applyFavorite(preset, true);
      if (input.action === 'unfavorite') this.applyFavorite(preset, false);
      if (input.action === 'add-tags') this.applyTags(preset, payload.tags || [], 'add');
      if (input.action === 'remove-tags') this.applyTags(preset, payload.tags || [], 'remove');
      if (input.action === 'set-tags') this.applyTags(preset, payload.tags || [], 'set');
      if (input.action === 'add-collections') this.applyCollections(preset, payload.collectionIds || [], 'add');
      if (input.action === 'remove-collections') this.applyCollections(preset, payload.collectionIds || [], 'remove');
      if (input.action === 'set-collections') this.applyCollections(preset, payload.collectionIds || [], 'set');
      await this.db.saveStylePreset(preset);
      updated.push(preset);
    }

    return updated;
  }

  async touchLastUsed(user: UserModel, kind: PresetKind, ids: string[]) {
    const unique = this.normalizeList(ids);
    if (!unique.length) return;
    const now = Date.now();
    for (const id of unique) {
      if (kind === 'FACE') {
        const preset = await this.db.getFacePreset(id);
        if (!preset) continue;
        this.requireOwnerOrAdmin(preset, user, '人脸预设');
        preset.lastUsedAt = now;
        await this.db.saveFacePreset(preset);
        continue;
      }
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if (!this.ensureKindMatch(preset, kind)) continue;
      this.requireOwnerOrAdmin(preset, user, kind === 'POSE' ? '姿势预设' : '风格预设');
      preset.lastUsedAt = now;
      await this.db.saveStylePreset(preset);
    }
  }
}
