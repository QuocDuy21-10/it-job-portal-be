import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Sse,
  BadRequestException,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import {
  ConversationHistoryQueryDto,
  ConversationHistoryResponseDto,
} from './dto/conversation-history.dto';
import { ResponseMessage } from '../utils/decorators/response-message.decorator';
import { SkipTransform } from '../utils/decorators/skip-transform.decorator';
import { Public } from '../utils/decorators/public.decorator';
import { User } from '../utils/decorators/user.decorator';
import { IUser } from '../users/user.interface';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
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
  @ResponseMessage('Message sent successfully')
  async sendMessage(
    @User() user: IUser,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<ChatResponseDto> {
    return this.chatService.sendMessage(user._id, sendMessageDto.message);
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
  @ResponseMessage('History retrieved successfully')
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
  @ResponseMessage('Conversation cleared successfully')
  async clearConversation(@User() user: IUser): Promise<{ message: string }> {
    return this.chatService.clearConversation(user._id);
  }

  @Post('stream')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Initiate a streaming chat response',
    description:
      'Starts AI processing and returns a streamId. Use GET /chat/stream/:streamId to receive SSE events.',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Stream initiated',
    schema: { properties: { streamId: { type: 'string' } } },
  })
  @ResponseMessage('Stream initiated')
  async initiateStream(
    @User() user: IUser,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<{ streamId: string }> {
    const streamId = await this.chatService.initiateStream(user._id, sendMessageDto.message);
    return { streamId };
  }

  @Sse('stream/:streamId')
  @Public()
  @SkipTransform()
  @ApiOperation({
    summary: 'Connect to streaming chat response via SSE',
    description:
      'EventSource endpoint. Events: "token" (text chunk), "done" (final metadata with recommendedJobs). Stream auto-closes after completion or 60s timeout.',
  })
  @ApiParam({ name: 'streamId', description: 'Stream ID from POST /chat/stream' })
  stream(@Param('streamId') streamId: string): Observable<MessageEvent> {
    const observable = this.chatService.getStream(streamId);
    if (!observable) {
      throw new BadRequestException('Stream not found or expired');
    }
    return observable;
  }
}
