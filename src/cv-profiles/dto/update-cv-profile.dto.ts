import { PartialType } from '@nestjs/swagger';
import { CreateCvProfileDto } from './create-cv-profile.dto';

export class UpdateCvProfileDto extends PartialType(CreateCvProfileDto) {}
