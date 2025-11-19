import { SkillMatchDto } from './skill-match.dto';
import { ResumePriority } from 'src/resumes/enums/resume-priority.enum';
import { ResumeStatus } from 'src/resumes/enums/resume-status.enum';

export class MatchResultDto {
  matchingScore: number;
    // Priority level (EXCELLENT, HIGH, MEDIUM, LOW)
  priority: ResumePriority;

  // Chi tiết matching từng skill
  skillsMatch: SkillMatchDto[];

  //  Percentage of skills matched (0-100)
  skillsMatchPercentage: number;

  //  Điểm experience (0-100)
  experienceScore: number;

  //  Điểm education (0-100)
  educationScore: number;

  //  Điểm mạnh của ứng viên
  strengths: string[];

  //  Điểm yếu / gaps của ứng viên
  weaknesses: string[];

  //  Recommendation text
  recommendation: string;

  //  Tóm tắt ngắn gọn về matching
  summary: string;

  //  Thời gian phân tích
  analyzedAt: Date;
}
