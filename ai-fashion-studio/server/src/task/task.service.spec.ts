import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TaskService } from './task.service';
import { DirectTaskService } from './direct-task.service';
import { LegacyTaskService } from './legacy-task.service';
import { TaskCrudService } from './task-crud.service';
import { CreateTaskDto } from './dto/create-task.dto';

describe('TaskService', () => {
  let service: TaskService;
  let legacyService: { createTask: jest.Mock; retryFailedShots: jest.Mock };
  let crudService: { getTask: jest.Mock };
  let directService: { retryDirectTask: jest.Mock };

  beforeEach(async () => {
    const crudMock = {
      getTask: jest.fn(),
      getAllTasks: jest.fn(),
      claimTask: jest.fn(),
      deleteTask: jest.fn(),
      setTaskFavorite: jest.fn(),
    };
    const directMock = {
      createDirectTask: jest.fn(),
      createDirectTaskFromUrls: jest.fn(),
      regenerateDirectTask: jest.fn(),
      directMessage: jest.fn(),
      retryDirectTask: jest.fn(),
    };
    const legacyMock = {
      createTask: jest.fn(),
      retryFailedShots: jest.fn(),
      startTask: jest.fn(),
      approveAndRender: jest.fn(),
      retryBrain: jest.fn(),
      retryRender: jest.fn(),
      updateShotPrompt: jest.fn(),
      editShot: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: TaskCrudService,
          useValue: crudMock,
        },
        {
          provide: DirectTaskService,
          useValue: directMock,
        },
        {
          provide: LegacyTaskService,
          useValue: legacyMock,
        },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
    legacyService = module.get(LegacyTaskService);
    crudService = module.get(TaskCrudService);
    directService = module.get(DirectTaskService);
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

  it('retryFailedShots throws when task not found', async () => {
    crudService.getTask.mockResolvedValue(null);

    await expect(service.retryFailedShots('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('retryFailedShots routes direct tasks to DirectTaskService', async () => {
    crudService.getTask.mockResolvedValue({
      id: 'task-1',
      scene: 'Auto',
      directPrompt: 'direct',
      shots: [],
    });
    directService.retryDirectTask.mockResolvedValue({ id: 'task-1' });

    await service.retryFailedShots('task-1');

    expect(directService.retryDirectTask).toHaveBeenCalledWith('task-1');
    expect(legacyService.retryFailedShots).not.toHaveBeenCalled();
  });

  it('retryFailedShots routes legacy tasks to LegacyTaskService', async () => {
    crudService.getTask.mockResolvedValue({
      id: 'task-2',
      scene: 'Auto',
      shots: [],
    });
    legacyService.retryFailedShots.mockResolvedValue({ id: 'task-2' });

    await service.retryFailedShots('task-2');

    expect(legacyService.retryFailedShots).toHaveBeenCalledWith('task-2', undefined);
    expect(directService.retryDirectTask).not.toHaveBeenCalled();
  });
});
