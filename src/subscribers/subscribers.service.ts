import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { IUser } from 'src/users/users.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Subscriber, SubscriberDocument } from './schemas/subscriber.schema';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import aqp from 'api-query-params';
import mongoose from 'mongoose';

@Injectable()
export class SubscribersService {
  constructor(
    @InjectModel(Subscriber.name)
    private subscriberModel: SoftDeleteModel<SubscriberDocument>,
  ) {}

  async create(createSubscriberDto: CreateSubscriberDto, user: IUser) {
    const { name, email, skills, location } = createSubscriberDto;
    const existingSubscriptionsCount = await this.subscriberModel.countDocuments({
      email,
      isDeleted: false 
    });

    if (existingSubscriptionsCount >= 3) {
      throw new BadRequestException(
        `Email: ${email} đã đạt giới hạn đăng ký nhận tin (tối đa 3 lần). Vui lòng quản lý các đăng ký cũ trước khi thêm mới.`,
      );
    }

    let newSubs = await this.subscriberModel.create({
      name,
      email,
      skills,
      location,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return {
      _id: newSubs?._id,
      createdBy: newSubs?.createdAt,
    };
  }

  async findAll(page?: number, limit?: number, query?: string) {
    const { filter, sort, population, projection } = aqp(query);
    delete filter.page;
    delete filter.limit;

    let offset = (+page - 1) * +limit;
    let defaultLimit = +limit ? +limit : 10;

    const totalItems = (await this.subscriberModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.subscriberModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .select(projection as any)
      .populate(population)
      .exec();

    return {
      result,
      meta: {
        pagination: {
          current_page: page,
          per_page: limit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string) {
    this.validateObjectId(id);

    return await this.subscriberModel.findById({
      _id: id,
    });
  }

  async update(updateSubscriberDto: UpdateSubscriberDto, user: IUser) {
    const updated = await this.subscriberModel.updateOne(
      { email: user.email },
      {
        ...updateSubscriberDto,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      },
      { upsert: true },
    );
    return updated;
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);

    await this.subscriberModel.updateOne(
      { _id: id },
      {
        deletedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );
    return this.subscriberModel.softDelete({
      _id: id,
    });
  }

  async getUserSkills(user: IUser) {
    const { email } = user;
    return await this.subscriberModel.findOne(
      {
        email, isDeleted: false,
      },
      { skills: 1, createdAt: 1 },
    );
  }

  async getMySubscriptions(user: IUser) {
    const { email } = user;
    const subscriptions = await this.subscriberModel
      .find({
        email,
        isDeleted: false,
      })
      .select('name email skills location createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      subscriptions,
      total: subscriptions.length,
      maxAllowed: 3,
    };
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Subscriber with id = ${id}`);
    }
  }
}
