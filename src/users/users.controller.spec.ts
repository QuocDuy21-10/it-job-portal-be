import { Test, TestingModule } from '@nestjs/testing';
import mongoose from 'mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: jest.Mocked<UsersService>;

  const currentUser = {
    _id: new mongoose.Types.ObjectId().toString(),
    email: 'user@example.com',
  } as any;

  beforeEach(async () => {
    mockUsersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      saveJob: jest.fn(),
      unsaveJob: jest.fn(),
      getSavedJobs: jest.fn(),
      followCompany: jest.fn(),
      unfollowCompany: jest.fn(),
      getFollowingCompanies: jest.fn(),
      findOne: jest.fn(),
      lockUser: jest.fn(),
      unlockUser: jest.fn(),
      bulkRemove: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should forward create requests to the service', async () => {
    const dto = {
      name: 'New User',
      email: 'new.user@example.com',
      password: 'Secret123!',
      role: new mongoose.Types.ObjectId().toString(),
    };
    const expected = { _id: new mongoose.Types.ObjectId() };
    mockUsersService.create.mockResolvedValue(expected as any);

    const result = await controller.create(dto as any, currentUser);

    expect(mockUsersService.create).toHaveBeenCalledWith(dto, currentUser);
    expect(result).toBe(expected);
  });

  it('should coerce findAll params and forward the query object', async () => {
    const query = { page: '2', limit: '5', name: 'alice' } as any;
    const expected = { result: [], meta: {} };
    mockUsersService.findAll.mockResolvedValue(expected as any);

    const result = await controller.findAll('2', '5', query);

    expect(mockUsersService.findAll).toHaveBeenCalledWith(2, 5, query);
    expect(result).toBe(expected);
  });

  it('should forward update requests to the service', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const dto = { name: 'Updated Name' };
    mockUsersService.update.mockResolvedValue({ matchedCount: 1 } as any);

    await controller.update(id, dto as any, currentUser);

    expect(mockUsersService.update).toHaveBeenCalledWith(id, dto, currentUser);
  });

  it('should save a job and return the explicit success body', async () => {
    const jobId = new mongoose.Types.ObjectId().toString();
    mockUsersService.saveJob.mockResolvedValue(undefined);

    const result = await controller.saveJob({ jobId }, currentUser);

    expect(mockUsersService.saveJob).toHaveBeenCalledWith(currentUser._id, jobId);
    expect(result).toEqual({ message: 'Job saved successfully' });
  });

  it('should unsave a job and return the explicit success body', async () => {
    const jobId = new mongoose.Types.ObjectId().toString();
    mockUsersService.unsaveJob.mockResolvedValue(undefined);

    const result = await controller.unsaveJob({ jobId }, currentUser);

    expect(mockUsersService.unsaveJob).toHaveBeenCalledWith(currentUser._id, jobId);
    expect(result).toEqual({ message: 'Job unsaved successfully' });
  });

  it('should use default pagination values for saved jobs', async () => {
    const expected = { result: [], meta: { current: 1 } };
    mockUsersService.getSavedJobs.mockResolvedValue(expected as any);

    const result = await (controller as any).getSavedJobs(currentUser);

    expect(mockUsersService.getSavedJobs).toHaveBeenCalledWith(currentUser._id, 1, 10);
    expect(result).toBe(expected);
  });

  it('should follow a company and return the explicit success body', async () => {
    const followedCompanyId = new mongoose.Types.ObjectId().toString();
    mockUsersService.followCompany.mockResolvedValue(undefined);

    const result = await controller.followCompany({ companyId: followedCompanyId }, currentUser);

    expect(mockUsersService.followCompany).toHaveBeenCalledWith(
      currentUser._id,
      followedCompanyId,
    );
    expect(result).toEqual({ message: 'Company followed successfully' });
  });

  it('should unfollow a company and return the explicit success body', async () => {
    const unfollowedCompanyId = new mongoose.Types.ObjectId().toString();
    mockUsersService.unfollowCompany.mockResolvedValue(undefined);

    const result = await controller.unfollowCompany(
      { companyId: unfollowedCompanyId },
      currentUser,
    );

    expect(mockUsersService.unfollowCompany).toHaveBeenCalledWith(
      currentUser._id,
      unfollowedCompanyId,
    );
    expect(result).toEqual({ message: 'Company unfollowed successfully' });
  });

  it('should forward getFollowingCompanies to the service', async () => {
    const expected = { result: [], total: 0 };
    mockUsersService.getFollowingCompanies.mockResolvedValue(expected as any);

    const result = await controller.getFollowingCompanies(currentUser);

    expect(mockUsersService.getFollowingCompanies).toHaveBeenCalledWith(currentUser._id);
    expect(result).toBe(expected);
  });

  it('should forward findOne to the service', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const expected = { _id: id };
    mockUsersService.findOne.mockResolvedValue(expected as any);

    const result = await controller.findOne(id);

    expect(mockUsersService.findOne).toHaveBeenCalledWith(id);
    expect(result).toBe(expected);
  });

  it('should forward lockUser to the service', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const dto = { reason: 'Policy violation' };
    mockUsersService.lockUser.mockResolvedValue({ _id: id } as any);

    await controller.lockUser(id, dto, currentUser);

    expect(mockUsersService.lockUser).toHaveBeenCalledWith(id, dto, currentUser);
  });

  it('should forward unlockUser to the service', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    mockUsersService.unlockUser.mockResolvedValue({ _id: id } as any);

    await controller.unlockUser(id, currentUser);

    expect(mockUsersService.unlockUser).toHaveBeenCalledWith(id, currentUser);
  });

  it('should forward bulkRemove to the service', async () => {
    const ids = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];
    mockUsersService.bulkRemove.mockResolvedValue({ deletedCount: 2 } as any);

    await controller.bulkRemove({ ids }, currentUser);

    expect(mockUsersService.bulkRemove).toHaveBeenCalledWith(ids, currentUser);
  });

  it('should forward remove to the service', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    mockUsersService.remove.mockResolvedValue({ deleted: 1 } as any);

    await controller.remove(id, currentUser);

    expect(mockUsersService.remove).toHaveBeenCalledWith(id, currentUser);
  });
});
