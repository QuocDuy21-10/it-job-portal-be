import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { Subscriber, SubscriberDocument } from '../schemas/subscriber.schema';

type AuditActor = {
  _id: mongoose.Types.ObjectId | string;
  email: string;
};

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
    return this.subscriberModel.create(this.normalizeAuditFields(data));
  }

  async findOwned(
    userId: string,
    filter: Record<string, any>,
    offset: number,
    limit: number,
    sort: Record<string, 1 | -1>,
  ): Promise<{ result: Subscriber[]; totalItems: number; totalPages: number }> {
    const scopedFilter = {
      ...filter,
      ...this.buildOwnerFilter(userId),
      isDeleted: false,
    };

    const totalItems = await this.subscriberModel.countDocuments(scopedFilter);
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const result = await this.subscriberModel
      .find(scopedFilter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .select('name email skills location locationCode createdAt updatedAt')
      .lean()
      .exec();

    return { result: result as unknown as Subscriber[], totalItems, totalPages };
  }

  async findOneOwned(id: string, userId: string): Promise<Subscriber | null> {
    return this.subscriberModel
      .findOne(this.buildOwnedRecordFilter(id, userId))
      .lean()
      .exec() as unknown as Subscriber | null;
  }

  async updateOneOwned(id: string, userId: string, update: Record<string, any>) {
    return this.subscriberModel.updateOne(
      this.buildOwnedRecordFilter(id, userId),
      this.normalizeAuditFields(update),
    );
  }

  async softDeleteOwned(id: string, userId: string, deletedBy: { _id: string; email: string }) {
    const scopedFilter = this.buildOwnedRecordFilter(id, userId);

    await this.subscriberModel.updateOne(scopedFilter, {
      deletedBy: this.normalizeAuditActor(deletedBy),
    });
    return this.subscriberModel.softDelete(scopedFilter);
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
      .select('name email skills location locationCode createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec() as unknown as Subscriber[];
  }

  private buildOwnedRecordFilter(id: string, userId: string): Record<string, any> {
    return {
      _id: id,
      ...this.buildOwnerFilter(userId),
      isDeleted: false,
    };
  }

  private buildOwnerFilter(userId: string): Record<string, any> {
    return {
      'createdBy._id': {
        $in: [userId, this.toObjectId(userId)],
      },
    };
  }

  private normalizeAuditFields<T extends Record<string, any>>(payload: T): T {
    const normalizedPayload: Record<string, any> = { ...payload };

    for (const field of ['createdBy', 'updatedBy', 'deletedBy'] as const) {
      if (normalizedPayload[field]) {
        normalizedPayload[field] = this.normalizeAuditActor(normalizedPayload[field]);
      }
    }

    return normalizedPayload as T;
  }

  private normalizeAuditActor(actor: AuditActor): AuditActor {
    return {
      ...actor,
      _id: this.toObjectId(actor._id),
    };
  }

  private toObjectId(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
    return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
  }
}
