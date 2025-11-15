/**
 * Skill Match DTO
 * Đại diện cho kết quả matching của từng skill
 */
export class SkillMatchDto {
  /**
   * Tên skill (từ job requirements)
   */
  skill: string;

  /**
   * Có match với CV hay không
   */
  matched: boolean;

  /**
   * Mức độ thành thạo (nếu matched)
   * none | beginner | intermediate | advanced | expert
   */
  proficiencyLevel: string;

  /**
   * Điểm cho skill này (0-100)
   */
  score: number;
}
