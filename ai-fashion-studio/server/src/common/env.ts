import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  INVITE_CODE_REQUIRED: boolFromString.optional(),
  CORS_ORIGINS: z.string().optional(),

  SETTINGS_ENCRYPTION_KEY: z.string().optional(),

  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),

  // 腾讯云 COS（可选：本地或生产按需配置）
  TENCENT_SECRET_ID: z.string().optional(),
  TENCENT_SECRET_KEY: z.string().optional(),
  COS_BUCKET: z.string().optional(),
  COS_REGION: z.string().optional(),
  COS_CDN_DOMAIN: z.string().optional(),
  COS_UPLOAD_ACL: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`环境变量校验失败: ${parsed.error.message}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV !== 'test') {
    if (!env.DATABASE_URL) {
      throw new Error('必须配置 DATABASE_URL（Postgres 连接串）');
    }

    if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
      throw new Error('DATABASE_URL 必须以 postgres:// 或 postgresql:// 开头');
    }
  }

  if (env.NODE_ENV === 'production') {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      throw new Error('生产环境必须配置强 JWT_SECRET（至少 32 位）');
    }

    if (!env.BOOTSTRAP_ADMIN_USERNAME || !env.BOOTSTRAP_ADMIN_PASSWORD) {
      throw new Error('生产环境必须配置 BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD 用于初始化管理员');
    }

    if (env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD 长度不足（至少 12 位）');
    }

    if (!env.SETTINGS_ENCRYPTION_KEY) {
      throw new Error('生产环境必须配置 SETTINGS_ENCRYPTION_KEY（32 bytes base64，用于加密模型密钥等设置）');
    }
  }

  return env;
}
