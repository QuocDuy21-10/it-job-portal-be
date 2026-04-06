import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { IUser } from 'src/users/user.interface';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get my notifications',
    description: 'Retrieves paginated notifications for the authenticated user',
  })
  @ResponseMessage('Notifications retrieved successfully')
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query() query: string,
    @User() user: IUser,
  ) {
    return this.notificationsService.findAllByUser(user._id, +page, +limit, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the number of unread notifications for the authenticated user',
  })
  @ResponseMessage('Unread count retrieved successfully')
  getUnreadCount(@User() user: IUser) {
    return this.notificationsService.getUnreadCount(user._id);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Marks a specific notification as read',
  })
  @ResponseMessage('Notification marked as read')
  markAsRead(@Param('id') id: string, @User() user: IUser) {
    return this.notificationsService.markAsRead(id, user._id);
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all unread notifications as read for the authenticated user',
  })
  @ResponseMessage('All notifications marked as read')
  markAllAsRead(@User() user: IUser) {
    return this.notificationsService.markAllAsRead(user._id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete notification',
    description: 'Soft deletes a notification',
  })
  @ResponseMessage('Notification deleted successfully')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.notificationsService.remove(id, user);
  }
}
