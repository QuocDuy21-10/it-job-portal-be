import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { Subscriber, SubscriberDocument } from '../schemas/subscriber.schema';

@Injectable()
export class SubscribersRepository {
  constructor(
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: SoftDeleteModel<SubscriberDocument>,
  ) {}

  validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid subscriber ID format');
    }
  }

  async countActiveByEmail(email: string): Promise<number> {
    return this.subscriberModel.countDocuments({ email, isDeleted: false });
  }

  async create(data: Record<string, any>): Promise<SubscriberDocument> {
    return this.subscriberModel.create(data);
  }

  async findOwned(
    filter: Record<string, any>,
    offset: number,
    limit: number,
    sort: Record<string, 1 | -1>,
  ): Promise<{ result: Subscriber[]; totalItems: number; totalPages: number }> {
    const totalItems = await this.subscriberModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const result = await this.subscriberModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .select('name email skills location createdAt updatedAt')
      .lean()
      .exec();

    return { result: result as unknown as Subscriber[], totalItems, totalPages };
  }

  async findOneOwned(id: string, userId: string): Promise<Subscriber | null> {
    return this.subscriberModel
      .findOne({
        _id: id,
        'createdBy._id': new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      })
      .lean()
      .exec() as unknown as Subscriber | null;
  }

  async updateOneOwned(id: string, userId: string, update: Record<string, any>) {
    return this.subscriberModel.updateOne(
      {
        _id: id,
        'createdBy._id': new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
      update,
    );
  }

  async softDeleteOwned(id: string, userId: string, deletedBy: { _id: string; email: string }) {
    await this.subscriberModel.updateOne(
      {
        _id: id,
        'createdBy._id': new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
      { deletedBy },
    );
    return this.subscriberModel.softDelete({ _id: id });
  }

  async findSkillsByEmail(email: string): Promise<Subscriber | null> {
    return this.subscriberModel
      .findOne({ email, isDeleted: false }, { skills: 1, createdAt: 1 })
      .lean()
      .exec() as unknown as Subscriber | null;
  }

  async findActiveByEmail(email: string): Promise<Subscriber[]> {
    return this.subscriberModel
      .find({ email, isDeleted: false })
      .select('name email skills location createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec() as unknown as Subscriber[];
  }
}
