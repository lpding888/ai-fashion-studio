import { Test, TestingModule } from '@nestjs/testing';
import { BrainService } from './brain.service';
import { TranslationService } from '../translation/translation.service';
import { CosService } from '../cos/cos.service';

describe('BrainService', () => {
  let service: BrainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrainService,
        {
          provide: TranslationService,
          useValue: {
            translateToZH: jest.fn(),
            translateBatch: jest.fn(),
          },
        },
        {
          provide: CosService,
          useValue: {
            isEnabled: jest.fn(() => true),
            isValidCosUrl: jest.fn(() => false),
            getImageUrl: jest.fn((key: string) => `https://cos.example.com/${key}`),
            uploadFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BrainService>(BrainService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
