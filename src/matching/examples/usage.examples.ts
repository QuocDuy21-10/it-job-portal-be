/**
 * EXAMPLE: How to Use MatchingService
 * 
 * This file demonstrates various use cases of the MatchingService
 * in different scenarios.
 */

import { MatchingService } from '../matching.service';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { Job } from 'src/jobs/schemas/job.schema';
import { JobLevel } from 'src/jobs/enums/job-level.enum';

// ============================================
// EXAMPLE 1: Basic Usage in Queue Processor
// ============================================

class ResumeQueueProcessorExample {
  constructor(private matchingService: MatchingService) {}

  async processResume(resumeId: string, jobId: string) {
    // 1. Fetch parsed CV data (from AI extraction)
    const parsedCV: ParsedDataDto = {
      fullName: 'Nguyen Van A',
      email: 'nguyenvana@example.com',
      phone: '+84 123 456 789',
      skills: ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Docker'],
      experience: [
        {
          company: 'ABC Tech',
          position: 'Frontend Developer',
          duration: '2021 - 2023',
          description: 'Developed web applications using React and TypeScript',
        },
        {
          company: 'XYZ Solutions',
          position: 'Junior Developer',
          duration: '2020 - 2021',
          description: 'Built features for e-commerce platform',
        },
      ],
      education: [
        {
          school: 'University of Technology',
          degree: 'Bachelor',
          major: 'Computer Science',
          duration: '2016 - 2020',
          gpa: '3.5',
        },
      ],
      summary: 'Passionate frontend developer with 3 years of experience',
      yearsOfExperience: 3,
    };

    // 2. Fetch job data
    const job = {
      name: 'Frontend Developer',
      skills: ['JavaScript', 'TypeScript', 'React', 'Redux', 'CSS'],
      level: JobLevel.JUNIOR,
      description: 'Looking for a frontend developer to join our team',
      // ... other job fields
    } as Job;

    // 3. Calculate match
    const matchResult = await this.matchingService.calculateMatch(
      parsedCV,
      job,
    );

    // 4. Use the result
    console.log('Match Result:', {
      score: matchResult.matchingScore,           // 85
      priority: matchResult.priority,             // ResumePriority.EXCELLENT
      autoStatus: matchResult.autoStatus,         // ResumeStatus.APPROVED
      recommendation: matchResult.recommendation, // "HIGHLY_RECOMMENDED"
      summary: matchResult.summary,
    });

    // 5. Detailed skills analysis
    console.log('Skills Match:');
    matchResult.skillsMatch.forEach((skillMatch) => {
      console.log(
        `  ${skillMatch.skill}: ${skillMatch.matched ? '✅' : '❌'} (${skillMatch.proficiencyLevel})`,
      );
    });
    // Output:
    //   JavaScript: ✅ (intermediate)
    //   TypeScript: ❌ (none)
    //   React: ✅ (intermediate)
    //   Redux: ❌ (none)
    //   CSS: ❌ (none)

    // 6. Insights
    console.log('Strengths:', matchResult.strengths);
    console.log('Weaknesses:', matchResult.weaknesses);

    return matchResult;
  }
}

// ============================================
// EXAMPLE 2: Batch Matching for Multiple Jobs
// ============================================

class BatchMatchingExample {
  constructor(private matchingService: MatchingService) {}

  async findBestMatchingJobs(parsedCV: ParsedDataDto, jobs: Job[]) {
    // Match CV against all jobs
    const matchResults = await Promise.all(
      jobs.map(async (job) => ({
        job,
        match: await this.matchingService.calculateMatch(parsedCV, job),
      })),
    );

    // Sort by score
    const sortedResults = matchResults.sort(
      (a, b) => b.match.matchingScore - a.match.matchingScore,
    );

    // Return top 5 matches
    return sortedResults.slice(0, 5).map((result) => ({
      jobName: result.job.name,
      score: result.match.matchingScore,
      priority: result.match.priority,
      recommendation: result.match.recommendation,
    }));
  }
}

// ============================================
// EXAMPLE 3: Custom Threshold Analysis
// ============================================

class CustomAnalysisExample {
  constructor(private matchingService: MatchingService) {}

  async analyzeWithCustomRules(parsedCV: ParsedDataDto, job: Job) {
    const matchResult = await this.matchingService.calculateMatch(
      parsedCV,
      job,
    );

    // Custom business logic
    const customAnalysis = {
      isHireReady: matchResult.matchingScore >= 80,
      needsInterview: matchResult.matchingScore >= 60,
      requiresTraining:
        matchResult.skillsMatchPercentage < 70 &&
        matchResult.experienceScore >= 70,
      isOverqualified:
        matchResult.experienceScore >= 95 &&
        job.level === JobLevel.JUNIOR,
      hasCriticalSkillsGap: matchResult.skillsMatch.some(
        (skill) =>
          !skill.matched &&
          this.isCriticalSkill(skill.skill, job.skills),
      ),
    };

    return {
      ...matchResult,
      customAnalysis,
    };
  }

  private isCriticalSkill(skill: string, allSkills: string[]): boolean {
    // Define critical skills (first 3 in list)
    const criticalSkills = allSkills.slice(0, 3);
    return criticalSkills.includes(skill);
  }
}

// ============================================
// EXAMPLE 4: Testing Different Scoring Scenarios
// ============================================

class ScoringScenarioTests {
  constructor(private matchingService: MatchingService) {}

  // Test Scenario 1: Perfect match
  async testPerfectMatch() {
    const parsedCV: ParsedDataDto = {
      fullName: 'Perfect Candidate',
      email: 'perfect@example.com',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS'],
      yearsOfExperience: 5,
      education: [{ degree: 'Bachelor', major: 'CS' } as any],
    } as any;

    const job = {
      name: 'Senior Developer',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS'],
      level: JobLevel.SENIOR,
    } as Job;

    const result = await this.matchingService.calculateMatch(parsedCV, job);
    
    console.assert(
      result.matchingScore >= 90,
      'Perfect match should score >= 90',
    );
    console.assert(
      result.priority === 'EXCELLENT',
      'Should have EXCELLENT priority',
    );
  }

  // Test Scenario 2: Partial match
  async testPartialMatch() {
    const parsedCV: ParsedDataDto = {
      fullName: 'Partial Candidate',
      email: 'partial@example.com',
      skills: ['JavaScript', 'React'],
      yearsOfExperience: 2,
      education: [{ degree: 'Bachelor' } as any],
    } as any;

    const job = {
      name: 'Frontend Developer',
      skills: ['JavaScript', 'TypeScript', 'React', 'Vue', 'Angular'],
      level: JobLevel.JUNIOR,
    } as Job;

    const result = await this.matchingService.calculateMatch(parsedCV, job);
    
    console.assert(
      result.matchingScore >= 40 && result.matchingScore <= 70,
      'Partial match should score 40-70',
    );
    console.assert(
      result.skillsMatchPercentage === 40,
      'Should match 2/5 skills = 40%',
    );
  }

  // Test Scenario 3: Over-qualified
  async testOverQualified() {
    const parsedCV: ParsedDataDto = {
      fullName: 'Senior Expert',
      email: 'senior@example.com',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go'],
      yearsOfExperience: 10,
      education: [{ degree: 'Master' } as any],
    } as any;

    const job = {
      name: 'Junior Developer',
      skills: ['JavaScript', 'React'],
      level: JobLevel.JUNIOR,
    } as Job;

    const result = await this.matchingService.calculateMatch(parsedCV, job);
    
    console.log('Over-qualified candidate:', {
      score: result.matchingScore,
      experienceScore: result.experienceScore, // Should be high but penalized
      autoStatus: result.autoStatus,
    });
  }

  // Test Scenario 4: Entry-level
  async testEntryLevel() {
    const parsedCV: ParsedDataDto = {
      fullName: 'Fresh Graduate',
      email: 'fresh@example.com',
      skills: ['JavaScript', 'HTML', 'CSS'],
      yearsOfExperience: 0,
      education: [{ degree: 'Bachelor', major: 'Computer Science' } as any],
    } as any;

    const job = {
      name: 'Intern Developer',
      skills: ['JavaScript', 'HTML', 'CSS', 'Git'],
      level: JobLevel.INTERN,
    } as Job;

    const result = await this.matchingService.calculateMatch(parsedCV, job);
    
    console.assert(
      result.experienceScore >= 70,
      'Fresh grad should score well for intern position',
    );
  }
}

// ============================================
// EXAMPLE 5: Real-time Dashboard / Admin Panel
// ============================================

class AdminDashboardExample {
  constructor(private matchingService: MatchingService) {}

  async getMatchStatistics(resumeIds: string[], jobId: string) {
    const job = await this.getJobById(jobId);
    const resumes = await this.getResumesByIds(resumeIds);

    const matchResults = await Promise.all(
      resumes.map((resume) =>
        this.matchingService.calculateMatch(resume.parsedData, job),
      ),
    );

    // Calculate statistics
    const statistics = {
      totalCandidates: matchResults.length,
      averageScore:
        matchResults.reduce((sum, r) => sum + r.matchingScore, 0) /
        matchResults.length,
      excellentCount: matchResults.filter((r) => r.priority === 'EXCELLENT')
        .length,
      highCount: matchResults.filter((r) => r.priority === 'HIGH').length,
      mediumCount: matchResults.filter((r) => r.priority === 'MEDIUM').length,
      lowCount: matchResults.filter((r) => r.priority === 'LOW').length,
      autoApproved: matchResults.filter((r) => r.autoStatus === 'APPROVED')
        .length,
      autoRejected: matchResults.filter((r) => r.autoStatus === 'REJECTED')
        .length,
      scoreDistribution: {
        '90-100': matchResults.filter((r) => r.matchingScore >= 90).length,
        '80-89': matchResults.filter(
          (r) => r.matchingScore >= 80 && r.matchingScore < 90,
        ).length,
        '70-79': matchResults.filter(
          (r) => r.matchingScore >= 70 && r.matchingScore < 80,
        ).length,
        '60-69': matchResults.filter(
          (r) => r.matchingScore >= 60 && r.matchingScore < 70,
        ).length,
        '0-59': matchResults.filter((r) => r.matchingScore < 60).length,
      },
      topSkillsGaps: this.findCommonSkillGaps(matchResults),
    };

    return statistics;
  }

  private findCommonSkillGaps(matchResults: any[]) {
    const skillGaps = new Map<string, number>();

    matchResults.forEach((result) => {
      result.skillsMatch.forEach((skill: any) => {
        if (!skill.matched) {
          skillGaps.set(skill.skill, (skillGaps.get(skill.skill) || 0) + 1);
        }
      });
    });

    return Array.from(skillGaps.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill, count]) => ({ skill, count }));
  }

  private async getJobById(id: string): Promise<Job> {
    // Mock implementation
    return {} as Job;
  }

  private async getResumesByIds(ids: string[]): Promise<any[]> {
    // Mock implementation
    return [];
  }
}

// ============================================
// EXAMPLE 6: A/B Testing Different Weights
// ============================================

class ABTestingExample {
  async compareScoringSystems(parsedCV: ParsedDataDto, job: Job) {
    // Current system (50% skills, 30% exp, 20% edu)
    const currentService = new MatchingService();
    const currentResult = await currentService.calculateMatch(parsedCV, job);

    // You could modify constants and test different approaches
    console.log('Current System Score:', currentResult.matchingScore);
    console.log('Breakdown:', {
      skills: currentResult.skillsMatchPercentage,
      experience: currentResult.experienceScore,
      education: currentResult.educationScore,
    });

    // Simulate different weights by manual calculation
    const skillsScore = currentResult.skillsMatchPercentage;
    const experienceScore = currentResult.experienceScore;
    const educationScore = currentResult.educationScore;

    const alternativeScores = {
      skillsHeavy: skillsScore * 0.7 + experienceScore * 0.2 + educationScore * 0.1,
      experienceHeavy: skillsScore * 0.3 + experienceScore * 0.5 + educationScore * 0.2,
      balanced: skillsScore * 0.4 + experienceScore * 0.4 + educationScore * 0.2,
    };

    console.log('Alternative Scoring Systems:', alternativeScores);

    return {
      current: currentResult.matchingScore,
      alternatives: alternativeScores,
    };
  }
}

// ============================================
// EXPORT EXAMPLES
// ============================================

export {
  ResumeQueueProcessorExample,
  BatchMatchingExample,
  CustomAnalysisExample,
  ScoringScenarioTests,
  AdminDashboardExample,
  ABTestingExample,
};
