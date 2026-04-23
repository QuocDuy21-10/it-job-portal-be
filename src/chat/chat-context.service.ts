import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CvProfilesService } from '../cv-profiles/cv-profiles.service';
import { UsersService } from '../users/users.service';
import { JobsService } from '../jobs/jobs.service';
import { CompaniesService } from '../companies/companies.service';
import {
  PlatformContext,
  UserContext,
  QueryAwareContext,
  FullChatContext,
} from './interfaces/chat-context.interface';
import { SKILL_VARIATIONS } from '../matching/constants/matching.constants';

@Injectable()
export class ChatContextService {
  private readonly logger = new Logger(ChatContextService.name);

  private readonly CACHE_TTL_USER_CONTEXT = 300000; // 5 minutes
  private readonly CACHE_TTL_PLATFORM_CONTEXT = 1800000; // 30 minutes
  private readonly CACHE_PREFIX_CTX = 'chat_ctx:';
  private readonly CACHE_KEY_PLATFORM = 'chat_platform_ctx';

  // Stats keywords for Vietnamese + English
  private readonly STATS_KEYWORDS = [
    'how many',
    'bao nhiêu',
    'statistics',
    'thống kê',
    'tổng số',
    'total',
    'count',
    'số lượng',
  ];

  // Precomputed skill lookup set (built once from SKILL_VARIATIONS)
  private readonly knownSkills: Set<string>;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private jobsService: JobsService,
    private companiesService: CompaniesService,
    private cvProfilesService: CvProfilesService,
    private usersService: UsersService,
  ) {
    // Build the known skills set from skill variations for fast lookup
    this.knownSkills = new Set<string>();
    for (const [key, aliases] of Object.entries(SKILL_VARIATIONS)) {
      this.knownSkills.add(key.toLowerCase());
      aliases.forEach(alias => this.knownSkills.add(alias.toLowerCase()));
    }
  }

  async buildFullContext(userId: string, message: string): Promise<FullChatContext> {
    const [platform, user] = await Promise.all([
      this.buildPlatformContext(),
      this.buildUserContext(userId),
    ]);

    const queryAware = await this.buildQueryAwareContext(message, platform);

    return { platform, user, queryAware };
  }

  async invalidateUserContext(userId: string): Promise<void> {
    await this.cacheManager.del(`${this.CACHE_PREFIX_CTX}${userId}`);
  }

  private async buildPlatformContext(): Promise<PlatformContext> {
    const cached = await this.cacheManager.get<PlatformContext>(this.CACHE_KEY_PLATFORM);
    if (cached) return cached;

    try {
      const stats = await this.jobsService.getPlatformJobStats();
      await this.cacheManager.set(this.CACHE_KEY_PLATFORM, stats, this.CACHE_TTL_PLATFORM_CONTEXT);
      return stats;
    } catch (error) {
      this.logger.warn('Error building platform context:', error);
      return {
        activeJobCount: 0,
        hiringCompaniesCount: 0,
        topSkills: [],
        topCompanies: [],
        jobsByLevel: [],
      };
    }
  }

  private async buildUserContext(userId: string): Promise<UserContext> {
    const cacheKey = `${this.CACHE_PREFIX_CTX}${userId}`;

    const cached = await this.cacheManager.get<UserContext>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [user, cvProfile] = await Promise.all([
        this.usersService.findOne(userId).catch(() => null),
        this.cvProfilesService.findByUserId(userId).catch(() => null),
      ]);

      const userSkills = cvProfile?.skills?.map(s => s.name || s) || [];
      const matchingJobs = await this.jobsService.findMatchingJobs(userSkills, 5);

      let appliedJobsCount = 0;
      if (cvProfile && cvProfile.appliedJobs) {
        appliedJobsCount = cvProfile.appliedJobs.length;
      }

      const context: UserContext = {
        user: user
          ? {
              name: user.name,
              email: user.email,
            }
          : null,
        profile: cvProfile
          ? {
              skills: userSkills,
              experience: cvProfile.experience || [],
              education: cvProfile.education || [],
              summary: cvProfile.summary,
              yearsOfExperience: cvProfile.yearsOfExperience,
            }
          : null,
        matchingJobs,
        appliedJobsCount,
      };

      await this.cacheManager.set(cacheKey, context, this.CACHE_TTL_USER_CONTEXT);
      return context;
    } catch (error) {
      this.logger.warn(`Error building user context for ${userId}:`, error);
      return {
        user: null,
        profile: null,
        matchingJobs: [],
        appliedJobsCount: 0,
      };
    }
  }

  private async buildQueryAwareContext(
    message: string,
    platform: PlatformContext,
  ): Promise<QueryAwareContext> {
    const result: QueryAwareContext = {
      detectedJobs: [],
      detectedCompanies: [],
      includeStats: false,
    };

    const lowerMessage = message.toLowerCase();

    // 1. Detect stats keywords
    result.includeStats = this.STATS_KEYWORDS.some(kw => lowerMessage.includes(kw));

    // 2. Detect skill names from message
    const detectedSkills = this.detectSkillsInMessage(lowerMessage, platform);

    // 3. Detect company names from message
    const detectedCompanyNames = this.detectCompaniesInMessage(lowerMessage, platform);

    // Fetch data in parallel
    const promises: Promise<void>[] = [];

    if (detectedSkills.length > 0) {
      promises.push(
        this.jobsService
          .searchJobs(detectedSkills, undefined, undefined, 10)
          .then(jobs => {
            result.detectedJobs = jobs;
          })
          .catch(err => {
            this.logger.warn('Error fetching jobs for detected skills:', err);
          }),
      );
    }

    if (detectedCompanyNames.length > 0) {
      for (const name of detectedCompanyNames.slice(0, 3)) {
        promises.push(
          this.companiesService
            .findByName(name, 2)
            .then(companies => {
              result.detectedCompanies.push(...companies);
            })
            .catch(err => {
              this.logger.warn(`Error fetching company "${name}":`, err);
            }),
        );
      }
    }

    await Promise.all(promises);
    return result;
  }

  private detectSkillsInMessage(lowerMessage: string, platform: PlatformContext): string[] {
    const detected = new Set<string>();

    // Check against platform top skills
    for (const skill of platform.topSkills) {
      if (lowerMessage.includes(skill.name.toLowerCase())) {
        detected.add(skill.name);
      }
    }

    // Check against known skills from SKILL_VARIATIONS
    // Use word boundary matching for short skill names to avoid false positives
    const words = lowerMessage.split(/[\s,;.!?]+/).filter(w => w.length >= 1);
    for (const word of words) {
      if (this.knownSkills.has(word)) {
        detected.add(word);
      }
    }

    // Also check multi-word patterns (e.g., "react native", "node.js", "machine learning")
    for (const [key, aliases] of Object.entries(SKILL_VARIATIONS)) {
      if (lowerMessage.includes(key)) {
        detected.add(key);
      }
      for (const alias of aliases) {
        if (lowerMessage.includes(alias)) {
          detected.add(key); // Normalize to canonical name
        }
      }
    }

    return [...detected];
  }

  private detectCompaniesInMessage(lowerMessage: string, platform: PlatformContext): string[] {
    const detected: string[] = [];

    for (const company of platform.topCompanies) {
      if (company.name && lowerMessage.includes(company.name.toLowerCase())) {
        detected.push(company.name);
      }
    }

    return detected;
  }
}
