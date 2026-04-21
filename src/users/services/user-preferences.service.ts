import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UserPreferencesService {
  constructor(private readonly userRepository: UserRepository) {}

  async saveJob(userId: string, jobId: string): Promise<void> {
    this.userRepository.validateObjectId(userId);
    this.userRepository.validateObjectId(jobId);

    const jobExists = await this.userRepository.jobExists(jobId);
    if (!jobExists) {
      throw new BadRequestException('Job not found or has been deleted');
    }

    const result = await this.userRepository.addSavedJob(userId, jobId);
    if (result.matchedCount === 0) {
      throw new BadRequestException('User not found');
    }
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    this.userRepository.validateObjectId(userId);
    this.userRepository.validateObjectId(jobId);

    const result = await this.userRepository.removeSavedJob(userId, jobId);
    if (result.matchedCount === 0) {
      throw new BadRequestException('User not found');
    }
  }

  async getSavedJobs(userId: string, page: number = 1, limit: number = 10) {
    this.userRepository.validateObjectId(userId);

    const offset = (page - 1) * limit;
    const user = await this.userRepository.findUserWithSavedJobs(userId);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const savedJobs = user.savedJobs || [];
    const total = savedJobs.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedJobs = savedJobs.slice(offset, offset + limit);

    return {
      result: paginatedJobs,
      meta: {
        current: page,
        pageSize: limit,
        pages: totalPages,
        total,
      },
    };
  }

  async followCompany(userId: string, companyId: string): Promise<void> {
    this.userRepository.validateObjectId(userId);
    this.userRepository.validateObjectId(companyId);

    const companyExists = await this.userRepository.companyExists(companyId);
    if (!companyExists) {
      throw new BadRequestException('Company not found or has been deleted');
    }

    const user = await this.userRepository.findUserCompanyFollowed(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isAlreadyFollowing = user.companyFollowed?.some(id => id.toString() === companyId);
    if (isAlreadyFollowing) {
      throw new BadRequestException('You are already following this company');
    }

    if (user.companyFollowed && user.companyFollowed.length >= 5) {
      throw new BadRequestException(
        'You can only follow up to 5 companies. Please unfollow a company first.',
      );
    }

    await this.userRepository.addFollowedCompany(userId, companyId);
  }

  async unfollowCompany(userId: string, companyId: string): Promise<void> {
    this.userRepository.validateObjectId(userId);
    this.userRepository.validateObjectId(companyId);

    const result = await this.userRepository.removeFollowedCompany(userId, companyId);
    if (result.matchedCount === 0) {
      throw new BadRequestException('User not found');
    }
  }

  async getFollowingCompanies(userId: string) {
    this.userRepository.validateObjectId(userId);

    const user = await this.userRepository.findUserWithFollowedCompanies(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      result: user.companyFollowed || [],
      total: user.companyFollowed?.length || 0,
    };
  }
}
