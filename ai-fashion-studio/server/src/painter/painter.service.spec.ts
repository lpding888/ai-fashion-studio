import { Test, TestingModule } from '@nestjs/testing';
import { PainterService } from './painter.service';
import { CosService } from '../cos/cos.service';

describe('PainterService', () => {
  let service: PainterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PainterService,
        {
          provide: CosService,
          useValue: {
            isEnabled: jest.fn(() => true),
            getImageUrl: jest.fn((key: string) => `https://cos.example.com/${key}`),
            uploadFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PainterService>(PainterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
