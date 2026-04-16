import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EJobApprovalStatus } from '../enums/job-approval-status.enum';

const ALLOWED_STATUSES = [EJobApprovalStatus.APPROVED, EJobApprovalStatus.REJECTED];

export class ApproveJobDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(ALLOWED_STATUSES, {
    message: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
  })
  @ApiProperty({
    example: EJobApprovalStatus.APPROVED,
    description: 'Approval decision — APPROVED or REJECTED',
    enum: ALLOWED_STATUSES,
  })
  status: EJobApprovalStatus;

  @IsOptional()
  @IsString({ message: 'approvalNote must be a string' })
  @MaxLength(500, { message: 'approvalNote is too long (max: 500 chars)' })
  @ApiPropertyOptional({
    example: 'Job description does not meet content guidelines.',
    description: 'Optional note from admin explaining approval or rejection decision',
    maxLength: 500,
  })
  approvalNote?: string;
}
