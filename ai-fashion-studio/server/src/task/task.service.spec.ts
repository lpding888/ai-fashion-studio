import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task.service';
import { DirectTaskService } from './direct-task.service';
import { LegacyTaskService } from './legacy-task.service';
import { TaskCrudService } from './task-crud.service';
import { CreateTaskDto } from './dto/create-task.dto';

describe('TaskService', () => {
  let service: TaskService;
  let legacyService: { createTask: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: TaskCrudService,
          useValue: {
            getTask: jest.fn(),
            getAllTasks: jest.fn(),
            claimTask: jest.fn(),
            deleteTask: jest.fn(),
          },
        },
        {
          provide: DirectTaskService,
          useValue: {
            createDirectTask: jest.fn(),
            createDirectTaskFromUrls: jest.fn(),
            regenerateDirectTask: jest.fn(),
            directMessage: jest.fn(),
          },
        },
        {
          provide: LegacyTaskService,
          useValue: {
            createTask: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
    legacyService = module.get(LegacyTaskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates createTask to LegacyTaskService', async () => {
    const result = { task: { id: 'task-1' }, claimToken: undefined };
    legacyService.createTask.mockResolvedValue(result);

    const dto: CreateTaskDto = {
      files: [],
      requirements: 'test',
      shot_count: 4,
      layout_mode: 'Individual',
      scene: 'Auto',
      resolution: '2K',
      workflow: 'hero_storyboard',
      autoApproveHero: true,
      userId: 'user-1',
    };
    const response = await service.createTask(dto);

    expect(legacyService.createTask).toHaveBeenCalled();
    expect(response).toBe(result);
  });
});
