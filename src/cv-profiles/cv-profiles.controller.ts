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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { MIME_TO_EXT } from '../files/constants/upload-policy';
import { CvProfilesService } from './cv-profiles.service';
import { CreateCvProfileDto } from './dto/create-cv-profile.dto';
import { User } from '../utils/decorators/user.decorator';
import { PaginationQueryDto } from '../utils/dto/pagination-query.dto';
import { resolvePagination } from '../utils/helpers/list-query.helper';
import { IUser } from '../users/user.interface';
import { JwtAuthGuard } from 'src/auth/guards';
import { FilesService } from '../files/files.service';
import { UpsertCvProfileDto } from './dto/upsert-cv-profile.dto';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { Roles } from 'src/casl/decorators/roles.decorator';
import { ERole } from 'src/casl/enums/role.enum';

@ApiTags('CV Profiles')
@Controller('cv-profiles')
@UseGuards(JwtAuthGuard)
export class CvProfilesController {
  constructor(
    private readonly cvProfilesService: CvProfilesService,
    private readonly filesService: FilesService,
  ) {}

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
          // Extension comes from the allowlisted MIME type, never the client filename (x.html would be served as HTML).
          cb(null, `${randomUUID()}${MIME_TO_EXT[file.mimetype]}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          cb(
            new BadRequestException('Ảnh đại diện chỉ chấp nhận tệp ảnh (JPEG, PNG, GIF, WEBP)'),
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
      'If CV exists, it will be updated. If not, a new CV will be created. ' +
      'personalInfo.email is read-only and derived from the authenticated account.',
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
              birthday: '1995-05-15',
              gender: 'Nam',
              address: '123 Đường ABC, Quận 1, TPHCM',
              personalLink: 'https://linkedin.com/in/nguyenvana',
              bio: 'Experienced developer with 5+ years',
            },
            skills: [{ id: 'skill-1', name: 'NestJS', level: 'Advanced' }],
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
        message: 'Lưu hồ sơ CV thành công',
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
  @ResponseMessage('Lưu hồ sơ CV thành công')
  async upsertCvProfile(
    @User() user: IUser,
    @Body('cvData') cvDataString: string,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    // Parse CV data from JSON string
    let cvData: UpsertCvProfileDto;
    try {
      cvData = JSON.parse(cvDataString);
    } catch {
      throw new BadRequestException('Trường cvData không đúng định dạng JSON');
    }

    // Process avatar upload if provided
    if (avatarFile) {
      await this.filesService.assertImageContent(avatarFile);
      const avatarUrl = this.filesService.processAvatarUpload(avatarFile);
      cvData.personalInfo = {
        ...cvData.personalInfo,
        avatar: avatarUrl,
      };
    }

    // Upsert CV profile
    const cvProfile = await this.cvProfilesService.upsertCvProfile(user._id, cvData);

    return cvProfile;
  }

  /**
   * GET /cv-profiles/me
   * Get current user's CV Profile
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get Current User CV Profile',
    description:
      'Retrieve the CV Profile of the currently authenticated user. If no saved CV exists, returns a non-persisted draft initialized from account information.',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profile retrieved successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'Lấy hồ sơ CV thành công',
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
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ResponseMessage('Lấy hồ sơ CV thành công')
  async getCurrentUserCv(@User() user: IUser) {
    const cvProfile = await this.cvProfilesService.getCurrentUserCv(user._id, {
      includeDraft: true,
    });

    return cvProfile;
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
        message: 'Đã kiểm tra hồ sơ CV',
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
  @ResponseMessage('Đã kiểm tra hồ sơ CV')
  async checkCvProfileExists(@User() user: IUser) {
    const exists = await this.cvProfilesService.hasCvProfile(user._id);

    return { exists };
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
  @ResponseMessage('Cập nhật hồ sơ CV thành công')
  async updateCurrentUserCv(@User() user: IUser, @Body() updateCvProfileDto: CreateCvProfileDto) {
    const cvProfile = await this.cvProfilesService.upsertCvProfile(user._id, updateCvProfileDto);

    return cvProfile;
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
      message: 'Xoá hồ sơ CV thành công',
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
        message: 'Tắt hồ sơ CV thành công',
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
  @ResponseMessage('Tắt hồ sơ CV thành công')
  async deactivateCvProfile(@User() user: IUser) {
    const cvProfile = await this.cvProfilesService.deactivateCvProfile(user._id);

    return cvProfile;
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
        message: 'Kích hoạt hồ sơ CV thành công',
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
  @ResponseMessage('Kích hoạt hồ sơ CV thành công')
  async activateCvProfile(@User() user: IUser) {
    const cvProfile = await this.cvProfilesService.activateCvProfile(user._id);

    return cvProfile;
  }

  /**
   * GET /cv-profiles/:id
   * Get any CV Profile by ID (SUPER_ADMIN only)
   */
  @Get(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get CV Profile by ID (Admin)',
    description: 'Retrieve any CV Profile by its ID. Requires SUPER_ADMIN role.',
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
  @ResponseMessage('Lấy hồ sơ CV thành công')
  async getCvProfileById(@Param('id') id: string) {
    const cvProfile = await this.cvProfilesService.findById(id);

    return cvProfile;
  }

  /**
   * GET /cv-profiles
   * Get all CV Profiles (SUPER_ADMIN only)
   */
  @Get()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get All CV Profiles (Admin)',
    description: 'Retrieve all CV Profiles with pagination. Requires SUPER_ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'CV Profiles retrieved successfully',
    schema: {
      example: {
        statusCode: 200,
        message: 'Lấy danh sách hồ sơ CV thành công',
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
  @ResponseMessage('Lấy danh sách hồ sơ CV thành công')
  async getAllCvProfiles(@Query() pagination: PaginationQueryDto) {
    const { page: pageNum, limit: limitNum } = resolvePagination(pagination.page, pagination.limit);

    const result = await this.cvProfilesService.findAll(pageNum, limitNum);

    return {
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
