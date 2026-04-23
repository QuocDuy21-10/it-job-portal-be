import { Test, TestingModule } from '@nestjs/testing';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

describe('SubscribersController', () => {
  let controller: SubscribersController;
  let mockSubscribersService: jest.Mocked<SubscribersService>;

  const user = {
    _id: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    name: 'Test User',
  } as any;

  beforeEach(async () => {
    mockSubscribersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getUserSkills: jest.fn(),
      getMySubscriptions: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [{ provide: SubscribersService, useValue: mockSubscribersService }],
    }).compile();

    controller = module.get<SubscribersController>(SubscribersController);
  });

  it('should delegate create to SubscribersService', async () => {
    const dto = { name: 'Nguyen Van Duy', skills: ['TypeScript'] } as any;
    mockSubscribersService.create.mockResolvedValue({ _id: 'sub-1' } as any);

    const result = await controller.create(dto, user);

    expect(mockSubscribersService.create).toHaveBeenCalledWith(dto, user);
    expect(result).toEqual({ _id: 'sub-1' });
  });

  it('should delegate findAll to SubscribersService with query paging arguments', async () => {
    const query = { page: 2, limit: 20, skill: 'TypeScript' } as any;
    mockSubscribersService.findAll.mockResolvedValue({ result: [] } as any);

    const result = await controller.findAll(query, user);

    expect(mockSubscribersService.findAll).toHaveBeenCalledWith(2, 20, query, user);
    expect(result).toEqual({ result: [] });
  });

  it('should delegate update to SubscribersService', async () => {
    const dto = { name: 'Updated Name' } as any;
    mockSubscribersService.update.mockResolvedValue({ _id: 'sub-1', ...dto } as any);

    const result = await controller.update('sub-1', dto, user);

    expect(mockSubscribersService.update).toHaveBeenCalledWith('sub-1', dto, user);
    expect(result).toEqual({ _id: 'sub-1', name: 'Updated Name' });
  });

  it('should delegate remove to SubscribersService', async () => {
    mockSubscribersService.remove.mockResolvedValue({ deleted: 1 } as any);

    const result = await controller.remove('sub-1', user);

    expect(mockSubscribersService.remove).toHaveBeenCalledWith('sub-1', user);
    expect(result).toEqual({ deleted: 1 });
  });

  it('should delegate getUserSkills to SubscribersService', async () => {
    mockSubscribersService.getUserSkills.mockResolvedValue({ skills: ['NestJS'] } as any);

    const result = await controller.getUserSkills(user);

    expect(mockSubscribersService.getUserSkills).toHaveBeenCalledWith(user);
    expect(result).toEqual({ skills: ['NestJS'] });
  });

  it('should delegate getMySubscriptions to SubscribersService', async () => {
    mockSubscribersService.getMySubscriptions.mockResolvedValue({ subscriptions: [], total: 0 } as any);

    const result = await controller.getMySubscriptions(user);

    expect(mockSubscribersService.getMySubscriptions).toHaveBeenCalledWith(user);
    expect(result).toEqual({ subscriptions: [], total: 0 });
  });

  it('should delegate findOne to SubscribersService', async () => {
    mockSubscribersService.findOne.mockResolvedValue({ _id: 'sub-1' } as any);

    const result = await controller.findOne('sub-1', user);

    expect(mockSubscribersService.findOne).toHaveBeenCalledWith('sub-1', user);
    expect(result).toEqual({ _id: 'sub-1' });
  });
});
