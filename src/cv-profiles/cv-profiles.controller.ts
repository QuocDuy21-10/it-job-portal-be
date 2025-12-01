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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { CvProfilesService } from './cv-profiles.service';
import { CreateCvProfileDto } from './dto/create-cv-profile.dto';
import { SkipCheckPermission, User } from '../decorator/customize';
import { IUser } from '../users/users.interface';
import { JwtAuthGuard } from 'src/auth/guards';
import { FilesService } from '../files/files.service';
import { UpsertCvProfileDto } from './dto/upsert-cv-profile.dto';

@ApiTags('CV Profiles')
@SkipCheckPermission()
@Controller('cv-profiles')
@UseGuards(JwtAuthGuard)
export class CvProfilesController {
  constructor(
    private readonly cvProfilesService: CvProfilesService,
    private readonly filesService: FilesService,
  ) {}

  /**
   * POST /cv-profiles/upsert
   * Upsert CV Profile for current user with optional avatar upload
   * If exists -> update, else -> create
   */
  @Post('upsert')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.cwd(), 'public', 'images', 'avatar');
          // Ensure directory exists
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const extName = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, extName);
          const finalName = `${baseName}-${Date.now()}${extName}`;
          cb(null, finalName);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Only image files (JPEG, PNG, GIF, WEBP) are allowed for avatar',
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create or Update CV Profile with Avatar Upload',
    description:
      'Smart upsert operation with optional avatar file upload. Supports multipart/form-data. ' +
      'Send CV data as JSON string in "cvData" field and optional avatar file in "avatar" field. ' +
      'If CV exists, it will be updated. If not, a new CV will be created.',
  })
@ApiBody({
    schema: {
      type: 'object',
      required: ['cvData'],
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (JPEG, PNG, GIF). Max 5MB.',
        },
        cvData: {
          type: 'string',
          description: 'CV Profile data as JSON string',
          example: JSON.stringify({
            personalInfo: {
              fullName: 'Nguyễn Văn A',
              title: 'Senior Full Stack Developer',
              phone: '0123456789',
              email: 'nguyenvana@example.com',
              birthday: '1995-05-15',
              gender: 'Nam',
              address: '123 Đường ABC, Quận 1, TPHCM',
              personalLink: 'https://linkedin.com/in/nguyenvana',
              bio: 'Experienced developer with 5+ years',
            },
            skills: [
              { id: 'skill-1', name: 'NestJS', level: 'Advanced' },
            ],
            experience: [
              {
                id: 'exp-1',
                company: 'Tech Corp',
                position: 'Backend Developer',
                startDate: '2020-01-01',
                endDate: '2023-12-31',
                description: 'Developed microservices',
              },
            ],
          }),
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile saved successfully with avatar URL',
    schema: {
      example: {
        statusCode: 200,
        message: 'CV Profile saved successfully',
        data: {
          _id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          personalInfo: {
            fullName: 'Nguyễn Văn A',
            title: 'Senior Full Stack Developer',
            phone: '0123456789',
            email: 'nguyenvana@example.com',
            avatar: 'http://localhost:8000/images/avatar/profile-1234567890.jpg',
          },
          skills: [],
          experience: [],
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid file type or validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async upsertCvProfile(
    @User() user: IUser,
     @Body('cvData') cvDataString: string,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    // Parse CV data from JSON string
    let cvData: UpsertCvProfileDto;
    try {
      cvData = JSON.parse(cvDataString);
    } catch (error) {
      throw new BadRequestException('Invalid JSON format for cvData field');
    }

    // Process avatar upload if provided
    if (avatarFile) {
      const avatarUrl = this.filesService.processAvatarUpload(avatarFile);
      cvData.personalInfo = {
        ...cvData.personalInfo,
        avatar: avatarUrl,
      };
    }

    // Upsert CV profile
    const cvProfile = await this.cvProfilesService.upsertCvProfile(
      user._id,
      cvData,
    );

    return {
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
      message: cvProfile 
        ? 'CV Profile retrieved successfully' 
        : 'User does not have a CV Profile yet', 
      data: cvProfile || null, 
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
