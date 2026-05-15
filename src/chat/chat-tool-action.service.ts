import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from 'src/users/users.service';
import { IUser } from 'src/users/user.interface';
import { CHAT_TOOL_ACTION_EXPIRY_MS } from './constants/chat.constant';
import { ChatToolActionResultDto, PendingChatToolActionDto } from './dto/chat-tool-action.dto';
import { EChatToolActionStatus, EChatToolActionType } from './enums/chat-tool-action.enum';
import { ChatRecommendedJobDto } from './dto/chat-recommended-job.dto';
import { ChatToolAction, ChatToolActionDocument } from './schemas/chat-tool-action.schema';

@Injectable()
export class ChatToolActionService {
  constructor(
    @InjectModel(ChatToolAction.name)
    private readonly chatToolActionModel: Model<ChatToolActionDocument>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async createSaveJobActions(input: {
    user: IUser;
    sessionId: string;
    jobs: ChatRecommendedJobDto[];
  }): Promise<PendingChatToolActionDto[]> {
    const unsavedJobs = input.jobs.filter(job => !input.user.savedJobs?.includes(job._id));

    if (unsavedJobs.length === 0) {
      return [];
    }

    const expiresAt = new Date(
      Date.now() +
        this.readPositiveIntConfig('CHAT_TOOL_ACTION_EXPIRY_MS', CHAT_TOOL_ACTION_EXPIRY_MS),
    );
    const actions = await this.chatToolActionModel.insertMany(
      unsavedJobs.map(job => ({
        userId: new Types.ObjectId(input.user._id),
        sessionId: new Types.ObjectId(input.sessionId),
        type: EChatToolActionType.SAVE_JOB,
        status: EChatToolActionStatus.PENDING,
        label: `Save ${job.name}`,
        payload: {
          jobId: job._id,
          jobName: job.name,
          companyName: job.company.name,
        },
        expiresAt,
      })),
    );

    return actions.map(action => this.serializePendingAction(action));
  }

  async confirm(user: IUser, actionId: string): Promise<ChatToolActionResultDto> {
    const action = await this.getOwnedPendingAction(user, actionId);

    if (action.expiresAt.getTime() <= Date.now()) {
      await this.chatToolActionModel.updateOne(
        { _id: action._id },
        { $set: { status: EChatToolActionStatus.EXPIRED } },
      );
      throw new BadRequestException('Chat tool action has expired');
    }

    if (action.type !== EChatToolActionType.SAVE_JOB) {
      throw new BadRequestException('Unsupported chat tool action');
    }

    const jobId = action.payload?.jobId;
    if (typeof jobId !== 'string' || !Types.ObjectId.isValid(jobId)) {
      throw new BadRequestException('Invalid chat tool action payload');
    }

    await this.usersService.saveJob(user._id, jobId);
    await this.chatToolActionModel.updateOne(
      { _id: action._id },
      {
        $set: {
          status: EChatToolActionStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      },
    );

    return {
      actionId: action._id.toString(),
      type: action.type,
      status: EChatToolActionStatus.CONFIRMED,
      message: 'Job saved successfully',
    };
  }

  async cancel(user: IUser, actionId: string): Promise<ChatToolActionResultDto> {
    const action = await this.getOwnedPendingAction(user, actionId);

    await this.chatToolActionModel.updateOne(
      { _id: action._id },
      {
        $set: {
          status: EChatToolActionStatus.CANCELED,
          canceledAt: new Date(),
        },
      },
    );

    return {
      actionId: action._id.toString(),
      type: action.type,
      status: EChatToolActionStatus.CANCELED,
      message: 'Chat tool action canceled',
    };
  }

  private async getOwnedPendingAction(
    user: IUser,
    actionId: string,
  ): Promise<ChatToolActionDocument> {
    if (!Types.ObjectId.isValid(actionId)) {
      throw new BadRequestException('Invalid chat tool action ID format');
    }

    const action = await this.chatToolActionModel
      .findOne({
        _id: new Types.ObjectId(actionId),
        status: EChatToolActionStatus.PENDING,
      })
      .exec();

    if (!action) {
      throw new NotFoundException('Chat tool action not found');
    }

    if (action.userId.toString() !== user._id) {
      throw new ForbiddenException('You cannot access this chat tool action');
    }

    return action;
  }

  private serializePendingAction(action: ChatToolActionDocument): PendingChatToolActionDto {
    return {
      actionId: action._id.toString(),
      type: action.type,
      label: action.label,
      payload: action.payload,
      expiresAt: action.expiresAt,
    };
  }

  private readPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback;

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }
}
