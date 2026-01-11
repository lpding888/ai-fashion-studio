import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task.service';
import { DbService } from '../db/db.service';
import { BrainService } from '../brain/brain.service';
import { PainterService } from '../painter/painter.service';
import { CreditService } from '../credit/credit.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { HeroStoryboardService } from './hero-storyboard.service';

describe('TaskService', () => {
  let service: TaskService;

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
          provide: CreditService,
          useValue: {
            hasEnoughCredits: jest.fn(async () => ({ enough: true, required: 0, balance: 0 })),
            spendCredits: jest.fn(),
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
            startHero: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
