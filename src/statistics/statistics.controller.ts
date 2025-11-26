import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SkipCheckPermission } from 'src/decorator/customize';

@ApiTags('Statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('dashboard')
  @SkipCheckPermission()    
  @ApiOperation({
    summary: 'Get dashboard statistics',
    description:
      'Retrieve comprehensive dashboard statistics including job counts, salary distribution, and trends. Data is cached for 15 minutes for optimal performance.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
    type: DashboardStatsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getDashboardStats(): Promise<DashboardStatsDto> {
    return this.statisticsService.getDashboardStats();
  }

  @Get('dashboard/refresh')
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Clear dashboard cache',
    description:
      'Manually clear the dashboard cache to force fresh data computation on next request',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard cache cleared successfully',
  })
  async clearDashboardCache(): Promise<{ message: string }> {
    await this.statisticsService.clearDashboardCache();
    return { message: 'Dashboard cache cleared successfully' };
  }
}
