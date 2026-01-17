import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';

// 注意：本仓库的 Prisma Client 生成到 TS 文件（server/generated/prisma），
// 其中内部引用使用了 `.js` 扩展名（importFileExtension=js），直接用 ts-node 运行会找不到 internal/*.js。
// 因此这里优先加载已编译的 JS 版本（server/dist/generated/prisma），以确保可执行。
// 若你尚未 build，请先运行 `pnpm -C "server" build` 生成 dist。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('../dist/generated/prisma/client');

type LegacyDbJson = {
  tasks?: any[];
  facePresets?: any[];
  stylePresets?: any[];
  creditTransactions?: any[];
  users?: any[];
};

function readEnv(serverDir: string) {
  dotenv.config({ path: path.join(serverDir, '.env') });
  dotenv.config({ path: path.join(serverDir, '.env.local') });
}

function asDate(value: unknown): Date {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) return new Date(value);
  if (value instanceof Date) return value;
  return new Date();
}

async function main() {
  const serverDir = path.join(__dirname, '..');
  readEnv(serverDir);

  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('缺少 DATABASE_URL（请在 server/.env 或 server/.env.local 中配置）');
  }

  const dbJsonPath = path.join(serverDir, 'data', 'db.json');
  if (!(await fs.pathExists(dbJsonPath))) {
    throw new Error(`未找到 ${dbJsonPath}`);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const legacy = (await fs.readJson(dbJsonPath)) as LegacyDbJson;
  const tasks = Array.isArray(legacy.tasks) ? legacy.tasks : [];
  const facePresets = Array.isArray(legacy.facePresets) ? legacy.facePresets : [];
  const stylePresets = Array.isArray(legacy.stylePresets) ? legacy.stylePresets : [];

  const chunk = async <T>(items: T[], size: number, fn: (part: T[]) => Promise<void>) => {
    for (let i = 0; i < items.length; i += size) {
      await fn(items.slice(i, i + size));
    }
  };

  console.log(`准备导入：tasks=${tasks.length} facePresets=${facePresets.length} stylePresets=${stylePresets.length}`);

  await prisma.$connect();

  try {
    await chunk(tasks, 50, async (part) => {
      await prisma.$transaction(
        part.map((task: any) => {
          const id = task?.id;
          if (!id) {
            throw new Error('发现缺少 id 的 task，无法导入');
          }
          return prisma.task.upsert({
            where: { id },
            create: {
              id,
              userId: task?.userId ?? null,
              status: String(task?.status ?? 'UNKNOWN'),
              creditsSpent: typeof task?.creditsSpent === 'number' ? task.creditsSpent : null,
              createdAt: asDate(task?.createdAt),
              data: task,
            },
            update: {
              userId: task?.userId ?? null,
              status: String(task?.status ?? 'UNKNOWN'),
              creditsSpent: typeof task?.creditsSpent === 'number' ? task.creditsSpent : null,
              createdAt: asDate(task?.createdAt),
              data: task,
            },
          });
        })
      );
    });

    await chunk(facePresets, 50, async (part) => {
      await prisma.$transaction(
        part.map((preset: any) => {
          const id = preset?.id;
          if (!id) {
            throw new Error('发现缺少 id 的 facePreset，无法导入');
          }
          return prisma.facePreset.upsert({
            where: { id },
            create: {
              id,
              name: String(preset?.name ?? 'untitled'),
              createdAt: asDate(preset?.createdAt),
              data: preset,
            },
            update: {
              name: String(preset?.name ?? 'untitled'),
              createdAt: asDate(preset?.createdAt),
              data: preset,
            },
          });
        })
      );
    });

    await chunk(stylePresets, 50, async (part) => {
      await prisma.$transaction(
        part.map((preset: any) => {
          const id = preset?.id;
          if (!id) {
            throw new Error('发现缺少 id 的 stylePreset，无法导入');
          }
          return prisma.stylePreset.upsert({
            where: { id },
            create: {
              id,
              name: String(preset?.name ?? 'untitled'),
              createdAt: asDate(preset?.createdAt),
              data: preset,
            },
            update: {
              name: String(preset?.name ?? 'untitled'),
              createdAt: asDate(preset?.createdAt),
              data: preset,
            },
          });
        })
      );
    });

    const [usersCount, tasksCount, faceCount, styleCount] = await Promise.all([
      prisma.user.count(),
      prisma.task.count(),
      prisma.facePreset.count(),
      prisma.stylePreset.count(),
    ]);

    console.log('导入完成（当前库统计）：', {
      users: usersCount,
      tasks: tasksCount,
      facePresets: faceCount,
      stylePresets: styleCount,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
