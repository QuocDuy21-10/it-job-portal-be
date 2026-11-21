import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Res,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { STRICT_THROTTLE } from 'src/config/throttle.constants';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import {
  ConversationHistoryQueryDto,
  ConversationHistoryResponseDto,
} from './dto/conversation-history.dto';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import { ChatSessionDto, ChatSessionListResponseDto } from './dto/chat-session.dto';
import {
  AiUsageQueryDto,
  AiUsageTimeseriesQueryDto,
  AiUsageTopUsersQueryDto,
} from './dto/ai-usage-query.dto';
import {
  AiUsageSummaryDto,
  AiUsageTimeseriesDto,
  AiUsageTopUsersDto,
} from './dto/ai-usage-stats.dto';
import { ChatToolActionResultDto } from './dto/chat-tool-action.dto';
import { ResponseMessage } from '../utils/decorators/response-message.decorator';
import { SkipTransform } from '../utils/decorators/skip-transform.decorator';
import { User } from '../utils/decorators/user.decorator';
import { IUser } from '../users/user.interface';
import { CHAT_ROUTE_RPM_LIMIT } from './constants/chat.constant';
import { AiUsageService } from './ai-usage.service';
import { ChatToolActionService } from './chat-tool-action.service';
import { Roles, ERole } from 'src/casl';
import { ChatQuotaExceededException } from './exceptions/too-many-requests.exception';

@ApiTags('Chat')
@Controller('chat')
@Throttle(STRICT_THROTTLE)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiUsageService: AiUsageService,
    private readonly chatToolActionService: ChatToolActionService,
  ) {}

  @Post('message')
  @Throttle({ default: { ttl: 60000, limit: CHAT_ROUTE_RPM_LIMIT } })
  @ApiOperation({
    summary: 'Send message to AI career advisor',
    description:
      'Chat with AI assistant about jobs, CV, career advice. Conversation history is maintained per user.',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid message format',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded',
  })
  @ResponseMessage('Gửi tin nhắn thành công')
  async sendMessage(
    @User() user: IUser,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<ChatResponseDto> {
    return this.chatService.sendMessage(
      user,
      sendMessageDto.message,
      undefined,
      sendMessageDto.jobId,
      sendMessageDto.clientMessageId,
    );
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get conversation history',
    description: 'Retrieve paginated conversation history for the current user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Messages per page (default: 50, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'History retrieved successfully',
    type: ConversationHistoryResponseDto,
  })
  @ResponseMessage('Lấy lịch sử trò chuyện thành công')
  async getHistory(
    @User() user: IUser,
    @Query() query: ConversationHistoryQueryDto,
  ): Promise<ConversationHistoryResponseDto> {
    return this.chatService.getConversationHistory(user._id, query.page || 1, query.limit || 50);
  }

  @Delete('clear')
  @ApiOperation({
    summary: 'Clear conversation',
    description: 'Clear current conversation history for the user',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation cleared successfully',
  })
  @ResponseMessage('Xoá cuộc trò chuyện thành công')
  async clearConversation(@User() user: IUser): Promise<{ message: string }> {
    return this.chatService.clearConversation(user._id);
  }

  @Post('sessions')
  @ApiOperation({
    summary: 'Create chat session',
    description: 'Create a new chat session for the current user',
  })
  @ApiBody({ type: CreateChatSessionDto })
  @ApiResponse({
    status: 201,
    description: 'Chat session created successfully',
    type: ChatSessionDto,
  })
  @ResponseMessage('Tạo phiên chat thành công')
  async createSession(
    @User() user: IUser,
    @Body() dto: CreateChatSessionDto,
  ): Promise<ChatSessionDto> {
    return this.chatService.createSession(user, dto);
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'List chat sessions',
    description: 'Retrieve chat sessions owned by the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat sessions retrieved successfully',
    type: ChatSessionListResponseDto,
  })
  @ResponseMessage('Lấy danh sách phiên chat thành công')
  async listSessions(@User() user: IUser): Promise<ChatSessionListResponseDto> {
    return this.chatService.listSessions(user._id);
  }

  @Get('sessions/:sessionId/messages')
  @ApiOperation({
    summary: 'Get chat session messages',
    description: 'Retrieve paginated messages for a specific chat session owned by the user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Messages per page (default: 50, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Session messages retrieved successfully',
    type: ConversationHistoryResponseDto,
  })
  @ResponseMessage('Lấy tin nhắn của phiên chat thành công')
  async getSessionMessages(
    @User() user: IUser,
    @Param('sessionId') sessionId: string,
    @Query() query: ConversationHistoryQueryDto,
  ): Promise<ConversationHistoryResponseDto> {
    return this.chatService.getSessionMessages(
      user._id,
      sessionId,
      query.page || 1,
      query.limit || 50,
    );
  }

  @Post('sessions/:sessionId/messages')
  @Throttle({ default: { ttl: 60000, limit: CHAT_ROUTE_RPM_LIMIT } })
  @ApiOperation({
    summary: 'Send message to a chat session',
    description: 'Send a message to a specific AI career advisor session',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: ChatResponseDto,
  })
  @ResponseMessage('Gửi tin nhắn thành công')
  async sendSessionMessage(
    @User() user: IUser,
    @Param('sessionId') sessionId: string,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<ChatResponseDto> {
    return this.chatService.sendMessage(
      user,
      sendMessageDto.message,
      sessionId,
      sendMessageDto.jobId,
      sendMessageDto.clientMessageId,
    );
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({
    summary: 'Clear chat session',
    description: 'Mark a specific chat session as inactive',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat session cleared successfully',
  })
  @ResponseMessage('Xoá phiên chat thành công')
  async clearSession(
    @User() user: IUser,
    @Param('sessionId') sessionId: string,
  ): Promise<{ message: string }> {
    return this.chatService.clearSession(user._id, sessionId);
  }

  @Get('admin/usage/summary')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get AI usage summary',
    description: 'Retrieve AI usage, cost, quota, cache, and reliability metrics.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI usage summary retrieved successfully',
    type: AiUsageSummaryDto,
  })
  @ResponseMessage('Lấy tổng hợp mức sử dụng AI thành công')
  async getUsageSummary(@Query() query: AiUsageQueryDto): Promise<AiUsageSummaryDto> {
    return this.aiUsageService.getUsageSummary(query);
  }

  @Get('admin/usage/timeseries')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get AI usage timeseries',
    description: 'Retrieve daily AI usage trend data.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI usage timeseries retrieved successfully',
    type: AiUsageTimeseriesDto,
  })
  @ResponseMessage('Lấy thống kê sử dụng AI theo thời gian thành công')
  async getUsageTimeseries(
    @Query() query: AiUsageTimeseriesQueryDto,
  ): Promise<AiUsageTimeseriesDto> {
    return this.aiUsageService.getUsageTimeseries(query);
  }

  @Get('admin/usage/top-users')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get top AI users',
    description: 'Retrieve users with the highest AI usage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Top AI users retrieved successfully',
    type: AiUsageTopUsersDto,
  })
  @ResponseMessage('Lấy danh sách người dùng AI nhiều nhất thành công')
  async getTopUsers(@Query() query: AiUsageTopUsersQueryDto): Promise<AiUsageTopUsersDto> {
    return this.aiUsageService.getTopUsers(query);
  }

  @Post('tool-actions/:actionId/confirm')
  @ApiOperation({
    summary: 'Confirm a pending chat tool action',
    description: 'Executes a pending chat tool action owned by the authenticated user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Chat tool action confirmed successfully',
    type: ChatToolActionResultDto,
  })
  @ResponseMessage('Xác nhận thao tác thành công')
  async confirmToolAction(
    @User() user: IUser,
    @Param('actionId') actionId: string,
  ): Promise<ChatToolActionResultDto> {
    return this.chatToolActionService.confirm(user, actionId);
  }

  @Delete('tool-actions/:actionId')
  @ApiOperation({
    summary: 'Cancel a pending chat tool action',
    description: 'Cancels a pending chat tool action owned by the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat tool action canceled successfully',
    type: ChatToolActionResultDto,
  })
  @ResponseMessage('Huỷ thao tác thành công')
  async cancelToolAction(
    @User() user: IUser,
    @Param('actionId') actionId: string,
  ): Promise<ChatToolActionResultDto> {
    return this.chatToolActionService.cancel(user, actionId);
  }

  @Post('message/stream')
  @Throttle({ default: { ttl: 60000, limit: CHAT_ROUTE_RPM_LIMIT } })
  @SkipTransform()
  @ApiOperation({
    summary: 'Stream AI career advisor response',
    description:
      'Authenticated fetch-stream endpoint. Events: "token" (text chunk), "done" (final metadata), "error" (safe error message).',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 200,
    description: 'SSE-compatible stream',
  })
  async streamMessage(
    @User() user: IUser,
    @Body() sendMessageDto: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.writeMessageStream(
      user,
      sendMessageDto.message,
      response,
      undefined,
      sendMessageDto.jobId,
      sendMessageDto.clientMessageId,
    );
  }

  @Post('sessions/:sessionId/messages/stream')
  @Throttle({ default: { ttl: 60000, limit: CHAT_ROUTE_RPM_LIMIT } })
  @SkipTransform()
  @ApiOperation({
    summary: 'Stream AI response for a chat session',
    description:
      'Authenticated fetch-stream endpoint for a specific session. Events: "token", "done", "error".',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 200,
    description: 'SSE-compatible stream',
  })
  async streamSessionMessage(
    @User() user: IUser,
    @Param('sessionId') sessionId: string,
    @Body() sendMessageDto: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.writeMessageStream(
      user,
      sendMessageDto.message,
      response,
      sessionId,
      sendMessageDto.jobId,
      sendMessageDto.clientMessageId,
    );
  }

  private async writeMessageStream(
    user: IUser,
    message: string,
    response: Response,
    sessionId?: string,
    jobId?: string,
    clientMessageId?: string,
  ): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    const abortController = new AbortController();
    // response 'close' fires on disconnect; req 'close' fires once the body is read.
    response.on('close', () => {
      if (!response.writableFinished) {
        abortController.abort();
      }
    });

    try {
      for await (const event of this.chatService.streamMessage(
        user,
        message,
        sessionId,
        jobId,
        clientMessageId,
        abortController.signal,
      )) {
        response.write(this.formatSseEvent(event.type, event.data));
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        response.write(this.formatSseEvent('error', this.getStreamErrorPayload(error)));
      }
    } finally {
      response.end();
    }
  }

  private formatSseEvent(event: string, data: string | Record<string, unknown>): string {
    const serializedData = typeof data === 'string' ? data : JSON.stringify(data);
    const dataLines = serializedData
      .split(/\r?\n/)
      .map(line => `data: ${line}`)
      .join('\n');

    return `event: ${event}\n${dataLines}\n\n`;
  }

  private getStreamErrorMessage(error: unknown): string {
    if (!(error instanceof HttpException)) {
      return 'Hiện chưa thể xử lý tin nhắn của bạn. Vui lòng thử lại sau.';
    }

    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    const message = (response as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join(', ') : message || error.message;
  }

  private getStreamErrorPayload(error: unknown): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      message: this.getStreamErrorMessage(error),
    };

    if (error instanceof ChatQuotaExceededException) {
      payload.quota = {
        remainingQuota: error.quota.remaining,
        nextResetTime: Math.floor(error.quota.resetAt.getTime() / 1000),
      };
    }

    return payload;
  }
}
