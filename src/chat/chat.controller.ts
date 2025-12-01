import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Body, 
  Query,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBody,
  ApiQuery,
  ApiResponse
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationHistoryQueryDto, ConversationHistoryResponseDto } from './dto/conversation-history.dto';
import { User, ResponseMessage, SkipCheckPermission } from '../decorator/customize';
import { IUser } from '../users/users.interface';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @SkipCheckPermission()
  @ApiOperation({ 
    summary: 'Send message to AI career advisor',
    description: 'Chat with AI assistant about jobs, CV, career advice. Conversation history is maintained per user.'
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: ChatResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid message format'
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded'
  })
  @ResponseMessage('Message sent successfully')
  async sendMessage(
    @User() user: IUser,
    @Body() sendMessageDto: SendMessageDto
  ): Promise<ChatResponseDto> {
    return this.chatService.sendMessage(
      user._id, 
      sendMessageDto.message
    );
  }

  @Get('history')
  @SkipCheckPermission()
  @ApiOperation({ 
    summary: 'Get conversation history',
    description: 'Retrieve paginated conversation history for the current user'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Messages per page (default: 50, max: 100)'
  })
  @ApiResponse({
    status: 200,
    description: 'History retrieved successfully',
    type: ConversationHistoryResponseDto
  })
  @ResponseMessage('History retrieved successfully')
  async getHistory(
    @User() user: IUser,
    @Query() query: ConversationHistoryQueryDto
  ): Promise<ConversationHistoryResponseDto> {
    return this.chatService.getConversationHistory(
      user._id, 
      query.page || 1,
      query.limit || 50
    );
  }

  @Delete('clear')
  @SkipCheckPermission()
  @ApiOperation({ 
    summary: 'Clear conversation',
    description: 'Clear current conversation history for the user'
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation cleared successfully'
  })
  @ResponseMessage('Conversation cleared successfully')
  async clearConversation(
    @User() user: IUser
  ): Promise<{ message: string }> {
    return this.chatService.clearConversation(user._id);
  }
}
