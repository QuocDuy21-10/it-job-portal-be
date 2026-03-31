import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import aqp from 'api-query-params';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';
import { IUser } from 'src/users/users.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: SoftDeleteModel<NotificationDocument>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Create notification, persist to DB, and emit via WebSocket
   */
  async create(
    createNotificationDto: CreateNotificationDto,
    createdBy?: { _id: string; email: string },
  ) {
    const notification = await this.notificationModel.create({
      ...createNotificationDto,
      userId: new mongoose.Types.ObjectId(createNotificationDto.userId),
      createdBy: createdBy
        ? { _id: new mongoose.Types.ObjectId(createdBy._id), email: createdBy.email }
        : undefined,
    });

    // Emit real-time notification via WebSocket
    this.notificationsGateway.sendToUser(
      createNotificationDto.userId,
      'notification:new',
      notification,
    );

    this.logger.log(
      `Notification created for user ${createNotificationDto.userId}: ${createNotificationDto.type}`,
    );

    return notification;
  }

  /**
   * Get paginated notifications for a user
   */
  async findAllByUser(userId: string, page?: number, limit?: number, query?: string) {
    const { filter, sort, population, projection } = aqp(query);
    delete filter.page;
    delete filter.limit;

    // Always scope to the authenticated user
    filter.userId = new mongoose.Types.ObjectId(userId);

    const defaultLimit = limit || 10;
    const offset = ((page || 1) - 1) * defaultLimit;

    const totalItems = await this.notificationModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.notificationModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort((sort as any) || { createdAt: -1 })
      .populate(population)
      .select(projection as any)
      .exec();

    return {
      result,
      meta: {
        pagination: {
          current_page: page || 1,
          per_page: defaultLimit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      isRead: false,
      isDeleted: { $ne: true },
    });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id: string, userId: string) {
    return this.notificationModel.updateOne(
      {
        _id: new mongoose.Types.ObjectId(id),
        userId: new mongoose.Types.ObjectId(userId),
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    return this.notificationModel.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  /**
   * Soft delete a notification
   */
  async remove(id: string, user: IUser) {
    await this.notificationModel.updateOne(
      {
        _id: new mongoose.Types.ObjectId(id),
        userId: new mongoose.Types.ObjectId(user._id),
      },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.notificationModel.softDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(user._id),
    });
  }
}
