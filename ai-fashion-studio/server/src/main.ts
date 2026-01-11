import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
  const staticRoot = isProd ? join(process.cwd(), 'uploads') : join(process.cwd());
  const staticPrefix = isProd ? '/uploads' : '/';
  app.useStaticAssets(staticRoot, { prefix: staticPrefix });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
