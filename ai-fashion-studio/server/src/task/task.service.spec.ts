import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task.service';
import { DbService } from '../db/db.service';
import { BrainService } from '../brain/brain.service';
import { PainterService } from '../painter/painter.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { HeroStoryboardService } from './hero-storyboard.service';
import { TaskBillingService } from './task-billing.service';
import { CosService } from '../cos/cos.service';
import { PrismaService } from '../prisma/prisma.service';
import { DirectPromptService } from '../direct-prompt/direct-prompt.service';

describe('TaskService', () => {
  let service: TaskService;
  let db: { saveTask: jest.Mock; updateTask: jest.Mock; getTask: jest.Mock; getFacePreset: jest.Mock };
  let hero: { startHero: jest.Mock; regenerateHero?: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: DbService,
          useValue: {
            saveTask: jest.fn(),
            updateTask: jest.fn(),
            getTask: jest.fn(),
            getFacePreset: jest.fn(),
          },
        },
        {
          provide: BrainService,
          useValue: {
            planTask: jest.fn(),
          },
        },
        {
          provide: PainterService,
          useValue: {
            generateImage: jest.fn(),
            generateImageWithLog: jest.fn(),
          },
        },
        {
          provide: TaskBillingService,
          useValue: {
            hasEnoughCreditsForAmount: jest.fn(async () => ({ enough: true, required: 0, balance: 0 })),
            creditsForSuccessfulHeroImage: jest.fn(() => 1),
            estimateLegacyTaskCredits: jest.fn(() => 1),
          },
        },
        {
          provide: ModelConfigResolverService,
          useValue: {
            buildSnapshotFromActive: jest.fn(async () => ({})),
            resolveBrainRuntimeFromSnapshot: jest.fn(async (s: any) => s || {}),
            resolvePainterRuntimeFromSnapshot: jest.fn(async (s: any) => s || {}),
          },
        },
        {
          provide: HeroStoryboardService,
          useValue: {
            startHero: jest.fn(async () => ({})),
            regenerateHero: jest.fn(async () => ({})),
          },
        },
        {
          provide: CosService,
          useValue: {
            isEnabled: jest.fn(() => false),
            uploadFile: jest.fn(),
            getImageUrl: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            task: {
              count: jest.fn(async () => 0),
              findMany: jest.fn(async () => []),
            },
          },
        },
        {
          provide: DirectPromptService,
          useValue: {
            getActiveSystemPromptText: jest.fn(async () => ''),
          },
        },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
    db = module.get(DbService);
    hero = module.get(HeroStoryboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates hero_storyboard task and starts Hero workflow (non-draft)', async () => {
    db.saveTask.mockResolvedValue(undefined);

    const { task } = await service.createTask({
      files: [],
      requirements: 'test',
      shot_count: 4,
      layout_mode: 'Individual',
      scene: 'Auto',
      resolution: '2K',
      workflow: 'hero_storyboard',
      autoApproveHero: true,
      userId: 'user-1',
    } as any);

    expect(task.workflow).toBe('hero_storyboard');
    expect(task.autoApproveHero).toBe(true);
    expect(task.status).toBe('HERO_RENDERING');
    expect(hero.startHero).toHaveBeenCalledWith(task.id);
  });
});
