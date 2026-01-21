import { Test, TestingModule } from '@nestjs/testing';
import { FacePresetController } from './face-preset.controller';
import { DbService } from '../db/db.service';
import { CosService } from '../cos/cos.service';
import { FacePresetMigrationService } from './face-preset-migration.service';

describe('FacePresetController', () => {
  let controller: FacePresetController;
  let db: { getAllFacePresets: jest.Mock; getFacePreset: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacePresetController],
      providers: [
        {
          provide: DbService,
          useValue: {
            getAllFacePresets: jest.fn(),
            getFacePreset: jest.fn(),
          },
        },
        {
          provide: CosService,
          useValue: {
            isEnabled: jest.fn(() => false),
          },
        },
        {
          provide: FacePresetMigrationService,
          useValue: {
            getMigrationStatus: jest.fn(),
            migrateToCoS: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(FacePresetController);
    db = module.get(DbService);
  });

  it('filters face presets by userId for non-admin', async () => {
    db.getAllFacePresets.mockResolvedValue([
      { id: 'a', userId: 'u1', name: 'p1', imagePath: 'x', createdAt: 1 },
      { id: 'b', userId: 'u2', name: 'p2', imagePath: 'y', createdAt: 2 },
      { id: 'c', name: 'legacy', imagePath: 'z', createdAt: 3 }, // legacy (no userId)
    ]);

    const res = await controller.list({ id: 'u1', role: 'USER' } as any);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('a');
  });

  it('returns all face presets for admin', async () => {
    db.getAllFacePresets.mockResolvedValue([
      { id: 'a', userId: 'u1', name: 'p1', imagePath: 'x', createdAt: 1 },
      { id: 'b', userId: 'u2', name: 'p2', imagePath: 'y', createdAt: 2 },
      { id: 'c', name: 'legacy', imagePath: 'z', createdAt: 3 },
    ]);

    const res = await controller.list({ id: 'admin', role: 'ADMIN' } as any);
    expect(res).toHaveLength(3);
  });
});
