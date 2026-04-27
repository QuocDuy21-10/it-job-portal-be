import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { GetSubscribersQueryDto } from './dto/get-subscribers-query.dto';
import { IUser } from 'src/users/user.interface';
import { SubscribersRepository } from './repositories/subscribers.repository';
import mongoose from 'mongoose';
import { SkillsService } from 'src/skills/skills.service';

@Injectable()
export class SubscribersService {
  constructor(
    private readonly subscribersRepository: SubscribersRepository,
    private readonly skillsService: SkillsService,
  ) {}

  async create(createSubscriberDto: CreateSubscriberDto, user: IUser) {
    const { name, location } = createSubscriberDto;
    // Email is always derived from the authenticated user — never client-controlled
    const email = user.email;

    const existingCount = await this.subscribersRepository.countActiveByEmail(email);
    if (existingCount >= 3) {
      throw new BadRequestException(
        'Subscription limit reached. You already have 3 active subscriptions. Please manage existing subscriptions before adding new ones.',
      );
    }

    const normalizedSkills = await this.skillsService.normalizeControlledSkills(
      createSubscriberDto.skills,
    );

    const newSubs = await this.subscribersRepository.create({
      name,
      email,
      skills: normalizedSkills,
      location,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return {
      _id: newSubs?._id,
      createdAt: newSubs?.createdAt,
    };
  }

  async findAll(page: number, limit: number, query: GetSubscribersQueryDto, user: IUser) {
    const defaultPage = page >= 1 ? page : 1;
    const defaultLimit = limit >= 1 ? Math.min(limit, 100) : 10;
    const offset = (defaultPage - 1) * defaultLimit;

    const filter: Record<string, any> = {
      'createdBy._id': new mongoose.Types.ObjectId(user._id),
      isDeleted: false,
    };

    if (query.location) {
      filter.location = { $regex: this.escapeRegex(query.location), $options: 'i' };
    }
    if (query.skill) {
      const [normalizedSkill] = await this.skillsService.normalizeControlledSkills([query.skill]);
      filter.skills = { $in: [normalizedSkill] };
    }

    const sortField = query.sortBy ?? 'createdAt';
    const sortDir: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

    const { result, totalItems, totalPages } = await this.subscribersRepository.findOwned(
      filter,
      offset,
      defaultLimit,
      sort,
    );

    return {
      result,
      meta: {
        pagination: {
          current_page: defaultPage,
          per_page: defaultLimit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string, user: IUser) {
    this.subscribersRepository.validateObjectId(id);
    const subscriber = await this.subscribersRepository.findOneOwned(id, user._id);
    if (!subscriber) {
      throw new NotFoundException('Subscriber not found');
    }
    return subscriber;
  }

  async update(id: string, updateSubscriberDto: UpdateSubscriberDto, user: IUser) {
    this.subscribersRepository.validateObjectId(id);

    const existing = await this.subscribersRepository.findOneOwned(id, user._id);
    if (!existing) {
      throw new NotFoundException('Subscriber not found');
    }

    await this.subscribersRepository.updateOneOwned(id, user._id, {
      ...updateSubscriberDto,
      ...(updateSubscriberDto.skills
        ? {
            skills: await this.skillsService.normalizeControlledSkills(updateSubscriberDto.skills),
          }
        : {}),
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return this.subscribersRepository.findOneOwned(id, user._id);
  }

  async remove(id: string, user: IUser) {
    this.subscribersRepository.validateObjectId(id);

    const existing = await this.subscribersRepository.findOneOwned(id, user._id);
    if (!existing) {
      throw new NotFoundException('Subscriber not found');
    }

    return this.subscribersRepository.softDeleteOwned(id, user._id, {
      _id: user._id,
      email: user.email,
    });
  }

  async getUserSkills(user: IUser) {
    return this.subscribersRepository.findSkillsByEmail(user.email);
  }

  async getMySubscriptions(user: IUser) {
    const subscriptions = await this.subscribersRepository.findActiveByEmail(user.email);
    return {
      subscriptions,
      total: subscriptions.length,
      maxAllowed: 3,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
