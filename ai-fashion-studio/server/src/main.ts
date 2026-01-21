import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { json, urlencoded } from 'express';
import { AdminLogService } from './admin-log/admin-log.service';
import { StreamLogger } from './admin-log/stream-logger';
import { config as loadEnv } from 'dotenv';

const loadEnvFiles = () => {
  const serverRoot = resolve(__dirname, '..', '..');
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(serverRoot, '.env'),
    resolve(serverRoot, '.env.local'),
  ];
  candidates.forEach((path) => {
    if (!existsSync(path)) return;
    loadEnv({ path, override: true });
  });
};

async function bootstrap() {
  // 确保环境变量在模块初始化前可用（兼容多工作目录启动）
  loadEnvFiles();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 允许 JSON 里携带 base64 图片（用于局部编辑 mask / 参考图）。
  // 默认 25mb，可用 env 覆盖：JSON_BODY_LIMIT=50mb
  const jsonBodyLimit = (process.env.JSON_BODY_LIMIT || '25mb').trim();
  app.use(json({ limit: jsonBodyLimit }));
  app.use(urlencoded({ extended: true, limit: jsonBodyLimit }));

  // 用于管理员后台实时查看后端日志（内存环形缓冲）
  app.useLogger(new StreamLogger(app.get(AdminLogService)));

  // 反代部署（Caddy/Nginx）下获取真实客户端 IP
  app.set('trust proxy', 1);

  // Enable CORS（生产环境建议用白名单）
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl / server-to-server
      if (corsOrigins.length === 0) return callback(null, true); // dev default
      return callback(null, corsOrigins.includes(origin));
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ✅ 设置全局API前缀
  app.setGlobalPrefix('api');

  // Serve Static Assets
  // ⚠️ 生产环境仅暴露 uploads，避免静态暴露源码/环境变量等敏感文件
  const isProd = process.env.NODE_ENV === 'production';
  const staticRoot = isProd
    ? join(process.cwd(), 'uploads')
    : join(process.cwd());
  const staticPrefix = isProd ? '/uploads' : '/';
  app.useStaticAssets(staticRoot, { prefix: staticPrefix });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
