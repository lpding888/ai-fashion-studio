import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ModelProvider } from '../common/model-config';

export type ModelProfileKind = 'BRAIN' | 'PAINTER';
export type ModelProfileProvider = ModelProvider;

export type EncryptedPayload = {
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
};

export type ModelProfilePublic = {
  id: string;
  kind: ModelProfileKind;
  provider: ModelProfileProvider;
  name: string;
  gateway: string;
  model: string;
  keyMasked: string;
  disabled?: boolean;
  createdAt: number;
  createdBy: { id: string; username: string };
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

type ModelProfileStored = ModelProfilePublic & {
  encryptedKey: EncryptedPayload;
};

type StoreFileV1 = {
  version: 1;
  // Backward compatible: can be a single id or a pool of ids
  active: { BRAIN?: string | string[]; PAINTER?: string | string[] };
  profiles: ModelProfileStored[];
};

type StoreFileV2 = {
  version: 2;
  // Backward compatible: can be a single id or a pool of ids
  active: { BRAIN?: string | string[]; PAINTER?: string | string[] };
  profiles: ModelProfileStored[];
};

export type ModelProfileRuntime = {
  id: string;
  kind: ModelProfileKind;
  provider: ModelProfileProvider;
  name: string;
  gateway: string;
  model: string;
  apiKey: string;
};

@Injectable()
export class ModelProfileService {
  private logger = new Logger(ModelProfileService.name);
  private secretsDir = path.join(process.cwd(), 'data', 'secrets');
  private storePath = path.join(this.secretsDir, 'model-profiles.json');

  private getEncryptionKey(): Buffer {
    const raw = process.env.SETTINGS_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'SETTINGS_ENCRYPTION_KEY 未配置（需要 32 bytes 的 base64）',
      );
    }

    let key: Buffer;
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      throw new Error('SETTINGS_ENCRYPTION_KEY 不是合法 base64');
    }

    if (key.length !== 32) {
      throw new Error(
        `SETTINGS_ENCRYPTION_KEY 长度不正确（需要 32 bytes，当前 ${key.length} bytes）`,
      );
    }

    return key;
  }

  private maskKey(apiKey: string) {
    const trimmed = (apiKey ?? '').trim();
    const last4 = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
    return `****${last4}`;
  }

  private encrypt(apiKey: string): {
    encryptedKey: EncryptedPayload;
    keyMasked: string;
  } {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(apiKey, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      encryptedKey: {
        ivB64: iv.toString('base64'),
        tagB64: tag.toString('base64'),
        ciphertextB64: ciphertext.toString('base64'),
      },
      keyMasked: this.maskKey(apiKey),
    };
  }

  private decrypt(payload: EncryptedPayload): string {
    const key = this.getEncryptionKey();
    const iv = Buffer.from(payload.ivB64, 'base64');
    const tag = Buffer.from(payload.tagB64, 'base64');
    const ciphertext = Buffer.from(payload.ciphertextB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  private normalizeProvider(value?: string): ModelProfileProvider {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'OPENAI_COMPAT') return 'OPENAI_COMPAT';
    return 'GEMINI';
  }

  private ensureProviderAllowed(
    kind: ModelProfileKind,
    provider: ModelProfileProvider,
  ) {
    if (kind === 'PAINTER' && provider !== 'GEMINI') {
      throw new Error('PAINTER 仅支持 GEMINI Provider');
    }
  }

  private async readStore(): Promise<StoreFileV2> {
    await fs.ensureDir(this.secretsDir);
    if (!(await fs.pathExists(this.storePath))) {
      const empty: StoreFileV2 = { version: 2, active: {}, profiles: [] };
      await fs.writeJson(this.storePath, empty, { spaces: 2 });
      return empty;
    }

    const raw = await fs.readJson(this.storePath);
    if (!raw || !Array.isArray(raw.profiles) || typeof raw.active !== 'object') {
      throw new Error('model-profiles.json 格式无效');
    }

    if (raw.version === 1) {
      const migrated: StoreFileV2 = {
        version: 2,
        active: raw.active || {},
        profiles: (raw.profiles || []).map((p: any) => ({
          ...p,
          provider: this.normalizeProvider(p?.provider || 'GEMINI'),
        })),
      };
      await this.writeStore(migrated);
      return migrated;
    }

    if (raw.version !== 2) {
      throw new Error('model-profiles.json 版本不支持');
    }

    const normalized: StoreFileV2 = {
      version: 2,
      active: raw.active || {},
      profiles: (raw.profiles || []).map((p: any) => ({
        ...p,
        provider: this.normalizeProvider(p?.provider || 'GEMINI'),
      })),
    };

    return normalized;
  }

  private async writeStore(next: StoreFileV2) {
    await fs.ensureDir(this.secretsDir);
    await fs.writeJson(this.storePath, next, { spaces: 2 });
  }

  async list(): Promise<{
    // 为了不破坏现有前端：active 仍返回“单个主 ID”（池的第一个）
    active: { BRAIN?: string; PAINTER?: string };
    // 新增：返回 Key 池（用于多 Key 并发）
    activePool: { BRAIN?: string[]; PAINTER?: string[] };
    profiles: ModelProfilePublic[];
  }> {
    const store = await this.readStore();
    const poolBrain = this.normalizeActiveIds(store.active?.BRAIN);
    const poolPainter = this.normalizeActiveIds(store.active?.PAINTER);
    return {
      active: {
        BRAIN: poolBrain[0],
        PAINTER: poolPainter[0],
      },
      activePool: {
        BRAIN: poolBrain.length > 0 ? poolBrain : undefined,
        PAINTER: poolPainter.length > 0 ? poolPainter : undefined,
      },
      profiles: store.profiles.map(({ encryptedKey: _k, ...pub }) => pub),
    };
  }

  async create(
    input: {
      kind: ModelProfileKind;
      provider?: ModelProfileProvider;
      name: string;
      gateway: string;
      model: string;
      apiKey: string;
    },
    admin: { id: string; username: string },
  ): Promise<ModelProfilePublic> {
    const name = (input.name ?? '').trim();
    const gateway = (input.gateway ?? '').trim();
    const model = (input.model ?? '').trim();
    const apiKey = (input.apiKey ?? '').trim();
    const provider = this.normalizeProvider(input.provider);

    if (!name) throw new Error('name 不能为空');
    if (!gateway) throw new Error('gateway 不能为空');
    if (!model) throw new Error('model 不能为空');
    if (!apiKey) throw new Error('apiKey 不能为空');
    this.ensureProviderAllowed(input.kind, provider);

    const store = await this.readStore();
    const id = crypto.randomUUID();
    const now = Date.now();
    const { encryptedKey, keyMasked } = this.encrypt(apiKey);

    const stored: ModelProfileStored = {
      id,
      kind: input.kind,
      provider,
      name,
      gateway,
      model,
      keyMasked,
      encryptedKey,
      createdAt: now,
      createdBy: admin,
      updatedAt: now,
      updatedBy: admin,
    };

    store.profiles.push(stored);
    await this.writeStore(store);

    const { encryptedKey: _k, ...pub } = stored;
    return pub;
  }

  async update(
    id: string,
    patch: Partial<{
      provider: ModelProfileProvider;
      name: string;
      gateway: string;
      model: string;
      apiKey: string;
      disabled: boolean;
    }>,
    admin: { id: string; username: string },
  ): Promise<ModelProfilePublic> {
    const store = await this.readStore();
    const profile = store.profiles.find((p) => p.id === id);
    if (!profile) throw new Error('profile 不存在');

    if (patch.provider !== undefined) {
      const nextProvider = this.normalizeProvider(patch.provider);
      this.ensureProviderAllowed(profile.kind, nextProvider);
      profile.provider = nextProvider;
    }

    if (patch.name !== undefined) {
      const v = patch.name.trim();
      if (!v) throw new Error('name 不能为空');
      profile.name = v;
    }

    if (patch.gateway !== undefined) {
      const v = patch.gateway.trim();
      if (!v) throw new Error('gateway 不能为空');
      profile.gateway = v;
    }

    if (patch.model !== undefined) {
      const v = patch.model.trim();
      if (!v) throw new Error('model 不能为空');
      profile.model = v;
    }

    if (patch.apiKey !== undefined) {
      const v = patch.apiKey.trim();
      if (!v) throw new Error('apiKey 不能为空');
      const { encryptedKey, keyMasked } = this.encrypt(v);
      profile.encryptedKey = encryptedKey;
      profile.keyMasked = keyMasked;
    }

    if (patch.disabled !== undefined) {
      profile.disabled = patch.disabled;
    }

    profile.updatedAt = Date.now();
    profile.updatedBy = admin;

    await this.writeStore(store);
    const { encryptedKey: _k, ...pub } = profile;
    return pub;
  }

  async remove(id: string): Promise<void> {
    const store = await this.readStore();
    const target = store.profiles.find((p) => p.id === id);
    if (!target) throw new Error('profile 不存在');

    const kind = target.kind;

    const pickReplacement = (
      preferredGateway: string,
      preferredModel: string,
    ) => {
      const byGroup = store.profiles
        .filter(
          (p) =>
            p.kind === kind &&
            !p.disabled &&
            p.id !== id &&
            p.gateway === preferredGateway &&
            p.model === preferredModel,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (byGroup.length > 0) return byGroup[0].id;

      const any = store.profiles
        .filter((p) => p.kind === kind && !p.disabled && p.id !== id)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return any[0]?.id;
    };

    // 先从 activePool 移除，并在必要时自动挑一个替代主 Key，避免删除 Active 导致系统无可用 Key
    const currentActive = this.normalizeActiveIds(store.active?.[kind]).filter(
      (activeId) => {
        const exists = store.profiles.some(
          (p) => p.id === activeId && p.kind === kind && !p.disabled,
        );
        return exists;
      },
    );

    const nextActive = currentActive.filter((activeId) => activeId !== id);
    if (currentActive.includes(id) && nextActive.length === 0) {
      const replacement = pickReplacement(target.gateway, target.model);
      if (replacement) nextActive.push(replacement);
    }

    if (nextActive.length > 0) {
      store.active[kind] = nextActive;
    } else {
      delete store.active[kind];
    }

    store.profiles = store.profiles.filter((p) => p.id !== id);
    await this.writeStore(store);
  }

  async setActive(
    kind: ModelProfileKind,
    id: string,
    admin: { id: string; username: string },
  ) {
    const store = await this.readStore();
    const profile = store.profiles.find((p) => p.id === id && p.kind === kind);
    if (!profile) throw new Error('profile 不存在或类型不匹配');
    if (profile.disabled) throw new Error('profile 已禁用');

    store.active[kind] = [id];
    profile.updatedAt = Date.now();
    profile.updatedBy = admin;
    await this.writeStore(store);
  }

  async setActivePool(
    kind: ModelProfileKind,
    ids: string[],
    admin: { id: string; username: string },
  ) {
    const store = await this.readStore();
    const unique = Array.from(
      new Set((ids || []).map((v) => String(v).trim()).filter(Boolean)),
    );
    if (unique.length === 0) throw new Error('activePool 不能为空');

    const profiles = unique.map((id) =>
      store.profiles.find((p) => p.id === id && p.kind === kind),
    );
    if (profiles.some((p) => !p))
      throw new Error('activePool 包含不存在或类型不匹配的 profileId');
    if (profiles.some((p) => (p as any).disabled))
      throw new Error('activePool 包含已禁用的 profile');

    store.active[kind] = unique;
    const now = Date.now();
    for (const p of profiles as any[]) {
      p.updatedAt = now;
      p.updatedBy = admin;
    }
    await this.writeStore(store);
  }

  async getRuntimeById(id: string): Promise<ModelProfileRuntime> {
    const store = await this.readStore();
    const profile = store.profiles.find((p) => p.id === id);
    if (!profile) throw new Error('profile 不存在');
    if (profile.disabled) throw new Error('profile 已禁用');
    const apiKey = this.decrypt(profile.encryptedKey).trim();
    if (!apiKey) throw new Error('profile 密钥无效');
    return {
      id: profile.id,
      kind: profile.kind,
      provider: profile.provider ?? 'GEMINI',
      name: profile.name,
      gateway: profile.gateway,
      model: profile.model,
      apiKey,
    };
  }

  async getActiveRuntime(kind: ModelProfileKind): Promise<ModelProfileRuntime> {
    const store = await this.readStore();
    const ids = this.normalizeActiveIds(store.active?.[kind]);
    const activeId = ids[0];
    if (!activeId) throw new Error(`未设置当前生效的 ${kind} 配置`);
    return this.getRuntimeById(activeId);
  }

  async getActiveRuntimePool(
    kind: ModelProfileKind,
  ): Promise<ModelProfileRuntime[]> {
    const store = await this.readStore();
    const ids = this.normalizeActiveIds(store.active?.[kind]);
    if (ids.length === 0) throw new Error(`未设置当前生效的 ${kind} 配置`);
    const runtimes: ModelProfileRuntime[] = [];
    for (const id of ids) {
      runtimes.push(await this.getRuntimeById(id));
    }
    return runtimes;
  }

  private normalizeActiveIds(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return Array.from(
        new Set(value.map((v) => String(v).trim()).filter(Boolean)),
      );
    }
    const single = String(value).trim();
    return single ? [single] : [];
  }

  private normalizeGatewayToV1beta(gateway: string) {
    let baseUrl = gateway.replace(/\/+$/, '');
    if (baseUrl.endsWith('/v1')) {
      baseUrl = baseUrl.replace('/v1', '/v1beta');
    } else if (!baseUrl.includes('/v1beta')) {
      baseUrl = `${baseUrl}/v1beta`;
    }
    return baseUrl;
  }

  private normalizeGatewayToV1(gateway: string) {
    let baseUrl = gateway.replace(/\/+$/, '');
    if (baseUrl.endsWith('/v1beta')) {
      baseUrl = baseUrl.replace('/v1beta', '/v1');
    } else if (!baseUrl.endsWith('/v1')) {
      baseUrl = `${baseUrl}/v1`;
    }
    return baseUrl;
  }

  private getTestTimeoutMs() {
    const raw = process.env.MODEL_PROFILE_TEST_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : 60000;
    if (!Number.isFinite(parsed) || parsed <= 0) return 60000;
    return Math.min(Math.max(parsed, 5000), 300000);
  }

  private buildTestPayload(kind: ModelProfileKind) {
    if (kind === 'PAINTER') {
      return {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Generate a simple studio product photo of a banana on white background. Return IMAGE only.',
              },
            ],
          },
        ],
        generationConfig: {
          // 图片模型测试：只要 IMAGE，避免网关/模型偏向返回 TEXT 导致“测试通过但无图”
          responseModalities: ['IMAGE'],
          candidateCount: 1,
          imageConfig: { imageSize: '1K', aspectRatio: '1:1' },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
        ],
      };
    }

    return {
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: { maxOutputTokens: 32 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
      ],
    };
  }

  async testProfile(id: string): Promise<{ ok: boolean; message: string }> {
    const runtime = await this.getRuntimeById(id);
    const timeout = this.getTestTimeoutMs();

    if (runtime.provider === 'OPENAI_COMPAT') {
      const baseUrl = String(runtime.gateway || '').trim().replace(/\/+$/, '');
      if (!baseUrl) {
        return { ok: false, message: 'gateway 不能为空' };
      }
      const endpoint = `${baseUrl}/chat/completions`;
      const res = await axios.post(
        endpoint,
        {
          model: runtime.model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 16,
          temperature: 0,
        },
        {
          headers: {
            Authorization: `Bearer ${runtime.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout,
        },
      );
      if (res.data?.choices?.length) {
        return { ok: true, message: '连接成功（OpenAI 兼容）' };
      }
      return { ok: false, message: '上游返回不符合预期（OpenAI 兼容）' };
    }

    const payload = this.buildTestPayload(runtime.kind);
    const tryOnce = async (baseUrl: string, label: 'v1beta' | 'v1') => {
      const endpoint = `${baseUrl}/models/${encodeURIComponent(runtime.model)}:generateContent?key=${encodeURIComponent(runtime.apiKey)}`;
      const res = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout,
      });
      if (res.data?.candidates || res.data?.promptFeedback) {
        return { ok: true as const, message: `连接成功（${label}）` };
      }
      return { ok: false as const, message: `上游返回不符合预期（${label}）` };
    };

    const primary: 'v1beta' | 'v1' =
      runtime.kind === 'PAINTER' ? 'v1' : 'v1beta';
    const secondary: 'v1beta' | 'v1' = primary === 'v1' ? 'v1beta' : 'v1';

    const baseUrlPrimary =
      primary === 'v1'
        ? this.normalizeGatewayToV1(runtime.gateway)
        : this.normalizeGatewayToV1beta(runtime.gateway);
    const baseUrlSecondary =
      secondary === 'v1'
        ? this.normalizeGatewayToV1(runtime.gateway)
        : this.normalizeGatewayToV1beta(runtime.gateway);

    try {
      return await tryOnce(baseUrlPrimary, primary);
    } catch (e: any) {
      const status = e?.response?.status as number | undefined;
      const msg = e?.response?.data?.error?.message || e?.message || '未知错误';

      const shouldFallback =
        status === 404 ||
        status === 400 ||
        e?.code === 'ECONNABORTED' ||
        String(msg).toLowerCase().includes('timeout');

      if (shouldFallback) {
        try {
          return await tryOnce(baseUrlSecondary, secondary);
        } catch (e2: any) {
          const status2 = e2?.response?.status as number | undefined;
          const msg2 =
            e2?.response?.data?.error?.message || e2?.message || '未知错误';
          return {
            ok: false,
            message: `${status2 ? `${status2}: ` : ''}${msg2}`,
          };
        }
      }

      return { ok: false, message: status ? `${status}: ${msg}` : msg };
    }
  }
}
