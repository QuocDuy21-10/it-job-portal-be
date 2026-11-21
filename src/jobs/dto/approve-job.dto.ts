import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EJobApprovalStatus } from '../enums/job-approval-status.enum';

const ALLOWED_STATUSES = [EJobApprovalStatus.APPROVED, EJobApprovalStatus.REJECTED];

export class ApproveJobDto {
  @IsNotEmpty({ message: 'Trạng thái là bắt buộc' })
  @IsEnum(ALLOWED_STATUSES, {
    message: `status phải là một trong các giá trị: ${ALLOWED_STATUSES.join(', ')}`,
  })
  @ApiProperty({
    example: EJobApprovalStatus.APPROVED,
    description: 'Approval decision — APPROVED or REJECTED',
    enum: ALLOWED_STATUSES,
  })
  status: EJobApprovalStatus;

  @IsOptional()
  @IsString({ message: 'approvalNote phải là chuỗi' })
  @MaxLength(500, { message: 'approvalNote quá dài (tối đa 500 ký tự)' })
  @ApiPropertyOptional({
    example: 'Job description does not meet content guidelines.',
    description: 'Optional note from admin explaining approval or rejection decision',
    maxLength: 500,
  })
  approvalNote?: string;
}
