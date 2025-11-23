import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CvProfilesService } from './cv-profiles.service';
import { CreateCvProfileDto } from './dto/create-cv-profile.dto';
import { UpdateCvProfileDto } from './dto/update-cv-profile.dto';
import { SkipCheckPermission, User } from '../decorator/customize';
import { IUser } from '../users/users.interface';
import { JwtAuthGuard } from 'src/auth/guards';

@ApiTags('CV Profiles')
@SkipCheckPermission()
@Controller('cv-profiles')
@UseGuards(JwtAuthGuard)
export class CvProfilesController {
  constructor(private readonly cvProfilesService: CvProfilesService) {}

  /**
   * POST /cv-profiles/upsert
   * Upsert CV Profile for current user
   * If exists -> update, else -> create
   */
  @Post('upsert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or Update CV Profile',
    description:
      'Smart upsert operation. If CV exists, it will be updated. If not, a new CV will be created. This is the recommended endpoint for saving CV data.',
  })
  @ApiBody({
    type: CreateCvProfileDto,
    description: 'CV Profile data matching CVData interface structure',
    examples: {
      'Complete CV': {
        value: {
          personalInfo: {
            fullName: 'Nguyễn Văn A',
            phone: '0123456789',
            email: 'nguyenvana@example.com',
            birthday: '1995-05-15',
            gender: 'Nam',
            address: '123 Đường ABC, Quận 1, TPHCM',
            personalLink: 'https://linkedin.com/in/nguyenvana',
            bio: 'Experienced Full Stack Developer with 5+ years of experience',
          },
          education: [
            {
              id: 'edu-1',
              school: 'Đại học Bách Khoa TPHCM',
              degree: 'Bachelor of Engineering',
              field: 'Computer Science',
              startDate: '2013-09-01',
              endDate: '2017-06-30',
              description: 'GPA: 3.8/4.0 - Graduated with honors',
            },
          ],
          experience: [
            {
              id: 'exp-1',
              company: 'Tech Corp Vietnam',
              position: 'Senior Backend Developer',
              startDate: '2020-01-01',
              endDate: '2023-12-31',
              description:
                'Developed and maintained microservices using NestJS, MongoDB, and Redis',
            },
          ],
          skills: [
            { id: 'skill-1', name: 'NestJS', level: 'Advanced' },
            { id: 'skill-2', name: 'MongoDB', level: 'Intermediate' },
            { id: 'skill-3', name: 'TypeScript', level: 'Advanced' },
          ],
          languages: [
            { id: 'lang-1', name: 'Vietnamese', proficiency: 'Native' },
            { id: 'lang-2', name: 'English', proficiency: 'Fluent' },
          ],
          projects: [
            {
              id: 'proj-1',
              name: 'E-commerce Platform',
              description: 'Full-stack e-commerce solution with payment integration',
              link: 'https://github.com/user/ecommerce',
            },
          ],
          certificates: [
            {
              id: 'cert-1',
              name: 'AWS Certified Developer',
              issuer: 'Amazon Web Services',
              date: '2022-06-15',
            },
          ],
          awards: [
            {
              id: 'award-1',
              name: 'Best Developer of the Year',
              date: '2023-12-01',
              description: 'Awarded for outstanding performance and innovation',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile saved successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profile saved successfully',
        data: {
          _id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          personalInfo: {
            fullName: 'Nguyễn Văn A',
            phone: '0123456789',
            email: 'nguyenvana@example.com',
            birthday: '1995-05-15',
            gender: 'Nam',
            address: '123 Đường ABC, Quận 1, TPHCM',
            personalLink: 'https://linkedin.com/in/nguyenvana',
            bio: 'Experienced Full Stack Developer',
          },
          education: [],
          experience: [],
          skills: [],
          languages: [],
          projects: [],
          certificates: [],
          awards: [],
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation failed',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'personalInfo.fullName should not be empty',
          'personalInfo.email must be an email',
        ],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async upsertCvProfile(
    @User() user: IUser,
    @Body() createCvProfileDto: CreateCvProfileDto,
  ) {
    const cvProfile = await this.cvProfilesService.upsertCvProfile(
      user._id,
      createCvProfileDto,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile saved successfully',
      data: cvProfile,
    };
  }

  /**
   * GET /cv-profiles/me
   * Get current user's CV Profile
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get Current User CV Profile',
    description: 'Retrieve the CV Profile of the currently authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile retrieved successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profile retrieved successfully',
        data: {
          _id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          personalInfo: {
            fullName: 'Nguyễn Văn A',
            phone: '0123456789',
            email: 'nguyenvana@example.com',
          },
          education: [],
          experience: [],
          skills: [],
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'CV Profile not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'CV Profile not found. Please create your CV first.',
        error: 'Not Found',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getCurrentUserCv(@User() user: IUser) {
    const cvProfile = await this.cvProfilesService.getCurrentUserCv(user._id);

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile retrieved successfully',
      data: cvProfile,
    };
  }

  /**
   * GET /cv-profiles/check
   * Check if current user has CV Profile
   */
  @Get('check')
  @ApiOperation({
    summary: 'Check if CV Profile Exists',
    description: 'Check whether the current user has created a CV Profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Check completed successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profile check completed',
        data: {
          exists: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async checkCvProfileExists(@User() user: IUser) {
    const exists = await this.cvProfilesService.hasCvProfile(user._id);

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile check completed',
      data: { exists },
    };
  }

  /**
   * PUT /cv-profiles/me
   * Update current user's CV Profile
   * Note: Use upsert instead for better UX
   */
  @Put('me')
  @ApiOperation({
    summary: 'Update Current User CV Profile',
    description:
      'Update existing CV Profile. Note: Using POST /upsert is recommended as it handles both create and update.',
  })
  @ApiBody({
    type: CreateCvProfileDto,
    description: 'Updated CV Profile data',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async updateCurrentUserCv(
    @User() user: IUser,
    @Body() updateCvProfileDto: CreateCvProfileDto,
  ) {
    const cvProfile = await this.cvProfilesService.upsertCvProfile(
      user._id,
      updateCvProfileDto,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile updated successfully',
      data: cvProfile,
    };
  }

  /**
   * DELETE /cv-profiles/me
   * Delete current user's CV Profile (hard delete)
   */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete Current User CV Profile',
    description:
      'Permanently delete the CV Profile. This action cannot be undone. Consider using deactivate instead for soft delete.',
  })
  @ApiResponse({
    status: 204,
    description: 'CV Profile deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'CV Profile not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async deleteCurrentUserCv(@User() user: IUser) {
    await this.cvProfilesService.deleteCvProfile(user._id);

    return {
      statusCode: HttpStatus.NO_CONTENT,
      message: 'CV Profile deleted successfully',
    };
  }

  /**
   * POST /cv-profiles/me/deactivate
   * Soft delete - deactivate CV Profile
   */
  @Post('me/deactivate')
  @ApiOperation({
    summary: 'Deactivate CV Profile',
    description:
      'Soft delete - Mark CV Profile as inactive. The data is preserved and can be reactivated later.',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile deactivated successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profile deactivated successfully',
        data: {
          _id: '507f1f77bcf86cd799439011',
          isActive: false,
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'CV Profile not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async deactivateCvProfile(@User() user: IUser) {
    const cvProfile = await this.cvProfilesService.deactivateCvProfile(
      user._id,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile deactivated successfully',
      data: cvProfile,
    };
  }

  /**
   * POST /cv-profiles/me/activate
   * Activate CV Profile
   */
  @Post('me/activate')
  @ApiOperation({
    summary: 'Activate CV Profile',
    description:
      'Reactivate a previously deactivated CV Profile. Makes the CV visible and active again.',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile activated successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profile activated successfully',
        data: {
          _id: '507f1f77bcf86cd799439011',
          isActive: true,
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'CV Profile not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async activateCvProfile(@User() user: IUser) {
    const cvProfile = await this.cvProfilesService.activateCvProfile(user._id);

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile activated successfully',
      data: cvProfile,
    };
  }

  /**
   * GET /cv-profiles/:id
   * Get CV Profile by ID
   * Note: Add role guard for admin/recruiter access
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get CV Profile by ID',
    description:
      'Retrieve a specific CV Profile by its ID. Typically used by admins or recruiters.',
  })
  @ApiParam({
    name: 'id',
    description: 'CV Profile ID (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid ID format',
  })
  @ApiResponse({
    status: 404,
    description: 'CV Profile not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getCvProfileById(@Param('id') id: string) {
    const cvProfile = await this.cvProfilesService.findById(id);

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profile retrieved successfully',
      data: cvProfile,
    };
  }

  /**
   * GET /cv-profiles
   * Get all CV Profiles (Admin only)
   * Add @Roles('ADMIN') decorator when implementing RBAC
   */
  @Get()
  @ApiOperation({
    summary: 'Get All CV Profiles (Admin)',
    description:
      'Retrieve all CV Profiles with pagination. This endpoint is intended for administrators only. Implement RBAC guard before production use.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 10)',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profiles retrieved successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profiles retrieved successfully',
        data: [
          {
            _id: '507f1f77bcf86cd799439011',
            userId: '507f1f77bcf86cd799439012',
            personalInfo: {
              fullName: 'Nguyễn Văn A',
              email: 'user1@example.com',
            },
            isActive: true,
          },
          {
            _id: '507f1f77bcf86cd799439013',
            userId: '507f1f77bcf86cd799439014',
            personalInfo: {
              fullName: 'Trần Thị B',
              email: 'user2@example.com',
            },
            isActive: true,
          },
        ],
        meta: {
          total: 100,
          page: 1,
          limit: 10,
          totalPages: 10,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getAllCvProfiles(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    const result = await this.cvProfilesService.findAll(pageNum, limitNum);

    return {
      statusCode: HttpStatus.OK,
      message: 'CV Profiles retrieved successfully',
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }
}
