import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { AdminDashboardStatsDto, HrDashboardStatsDto } from './dto/dashboard-stats.dto';
import { Roles, ERole } from 'src/casl';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { IUser } from 'src/users/user.interface';
import { Public } from 'src/utils/decorators/public.decorator';
import { PublicStatsDto } from './dto/public-stats.dto';

@ApiTags('Statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Get public homepage statistics',
    description:
      'Counts of publicly visible jobs (internal and crawled), jobs posted in the last 7 days, hiring companies and candidates. Cached for 15 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Public statistics retrieved successfully',
    type: PublicStatsDto,
  })
  @ResponseMessage('Lấy thống kê công khai thành công')
  async getPublicStats(): Promise<PublicStatsDto> {
    return this.statisticsService.getPublicStats();
  }

  @Get('admin-dashboard')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get admin dashboard statistics',
    description:
      'Retrieve platform-wide dashboard statistics for SUPER ADMIN users. Data is cached for 15 minutes for optimal performance.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard statistics retrieved successfully',
    type: AdminDashboardStatsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ResponseMessage('Lấy thống kê dashboard quản trị thành công')
  async getAdminDashboardStats(): Promise<AdminDashboardStatsDto> {
    return this.statisticsService.getAdminDashboardStats();
  }

  @Get('hr-dashboard')
  @Roles(ERole.HR)
  @ApiOperation({
    summary: 'Get HR dashboard statistics',
    description:
      'Retrieve dashboard statistics scoped to the authenticated HR user company. Data is cached for 3 minutes for optimal freshness.',
  })
  @ApiResponse({
    status: 200,
    description: 'HR dashboard statistics retrieved successfully',
    type: HrDashboardStatsDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - HR account is not associated with a company',
  })
  @ResponseMessage('Lấy thống kê dashboard HR thành công')
  async getHrDashboardStats(@User() user: IUser): Promise<HrDashboardStatsDto> {
    return this.statisticsService.getHrDashboardStats(user.company?._id);
  }
}
