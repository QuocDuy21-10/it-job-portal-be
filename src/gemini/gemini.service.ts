import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { AIAnalysisDto } from 'src/resumes/dto/ai-analysis.dto';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: GenerativeModel;

  // Model configuration
  private readonly MODEL_NAME = 'gemini-2.0-flash-exp';
  private readonly PARSE_MAX_TOKENS = 2000;
  private readonly MATCH_MAX_TOKENS = 1500;
  private readonly PARSE_TEMPERATURE = 0.3;
  private readonly MATCH_TEMPERATURE = 0.5;
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  // Rate limiting configuration (Gemini 2.0 Flash limits: RPM=15, TPM=1M, RPD=200)
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 5000; // 5 seconds
  private readonly MAX_RETRY_DELAY = 60000; // 60 seconds
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 4000; // 4 seconds between requests (15 RPM = 1 req per 4s)

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured');
      throw new Error('Gemini API key is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.MODEL_NAME,
    });

    this.logger.log(`Gemini AI Service initialized with model: ${this.MODEL_NAME}`);
  }

  /**
   * Parse CV text and extract structured information
   * @param cvText - Raw text extracted from CV
   * @returns Parsed data structure
   */
  async parseCV(cvText: string): Promise<ParsedDataDto> {
    try {
      const prompt = this.buildCVParsingPrompt(cvText);
      
      // Make request with rate limiting and retry logic
      const result = await this.makeRequestWithRetry(async () => {
        return await this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: this.PARSE_TEMPERATURE,
            maxOutputTokens: this.PARSE_MAX_TOKENS,
          },
        });
      });
      
      const response = result.response;
      const text = response.text();

      // Parse JSON response
      const parsedData = this.extractJSON<ParsedDataDto>(text);
      
      // Fallback: Try to extract email and phone with regex if missing
      if (!parsedData.email || !parsedData.phone) {
        const fallbackData = this.extractContactInfoWithRegex(cvText);
        parsedData.email = parsedData.email || fallbackData.email;
        parsedData.phone = parsedData.phone || fallbackData.phone;
      }
      
      this.logger.log('CV parsed successfully');
      return parsedData;
    } catch (error) {
      this.logger.error('Error parsing CV:', error);
      throw new Error(`CV parsing failed: ${error.message}`);
    }
  }

  /**
   * Analyze CV against job requirements and calculate matching score
   * @param parsedCV - Parsed CV data
   * @param jobDescription - Job description and requirements
   * @param jobSkills - Required skills for the job
   * @param jobLevel - Job level requirement
   * @returns AI analysis with matching score and recommendations
   */
  async analyzeResumeJobMatch(
    parsedCV: ParsedDataDto,
    jobDescription: string,
    jobSkills: string[],
    jobLevel?: string,
  ): Promise<AIAnalysisDto> {
    try {
      const prompt = this.buildMatchingAnalysisPrompt(
        parsedCV, 
        jobDescription, 
        jobSkills,
        jobLevel
      );
      
      // Make request with rate limiting and retry logic
      const result = await this.makeRequestWithRetry(async () => {
        return await this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: this.MATCH_TEMPERATURE,
            maxOutputTokens: this.MATCH_MAX_TOKENS,
          },
        });
      });
      
      const response = result.response;
      const text = response.text();

      // Parse JSON response
      const analysis = this.extractJSON<AIAnalysisDto>(text);
      
      // Validate and fallback
      if (!analysis.matchingScore || analysis.matchingScore < 0 || analysis.matchingScore > 100) {
        this.logger.warn('Invalid matching score, using fallback value');
        analysis.matchingScore = 50; // Default fallback
      }
      
      analysis.analyzedAt = new Date();
      
      this.logger.log(`Resume analyzed with matching score: ${analysis.matchingScore}`);
      return analysis;
    } catch (error) {
      this.logger.error('Error analyzing resume:', error);
      
      // Return fallback analysis
      return {
        matchingScore: 50,
        summary: 'Analysis failed. Manual review required.',
        recommendation: 'Manual review needed due to analysis error',
        analyzedAt: new Date(),
      };
    }
  }

  /**
   * Build prompt for CV parsing
   */
  private buildCVParsingPrompt(cvText: string): string {
    return `
You are an expert CV/Resume parser. Extract the following information from the CV text below.

IMPORTANT: Return ONLY a valid JSON object with no additional text, markdown, or code blocks.

Required JSON structure:
{
  "fullName": "candidate's full name (string)",
  "email": "email address (string)",
  "phone": "phone number with country code if available (string)",
  "skills": ["skill1", "skill2", "skill3", ...],
  "experience": [
    {
      "company": "company name",
      "position": "job title/role",
      "duration": "time period (e.g., Jan 2020 - Present, 2020-2022)",
      "description": "brief description of key responsibilities and achievements"
    }
  ],
  "education": [
    {
      "school": "university/institution name",
      "degree": "degree type (e.g., Bachelor, Master, PhD)",
      "major": "field of study/specialization",
      "duration": "time period (e.g., 2016-2020)",
      "gpa": "GPA if available (optional)"
    }
  ],
  "summary": "brief professional summary or objective (2-3 sentences)",
  "yearsOfExperience": <number of total years of work experience>
}

EXTRACTION RULES:
- Extract all technical and soft skills mentioned
- Include programming languages, frameworks, tools, and methodologies
- Calculate yearsOfExperience by analyzing work history dates
- If information is not found, use empty string "" or empty array []
- Ensure all arrays contain at least the most relevant items
- Phone numbers should include country code if present (e.g., +84, +1)

CV TEXT:
${cvText}

Return ONLY the JSON object. No markdown, no explanation, no additional text.
`;
  }

  /**
   * Build prompt for matching analysis
   */
  private buildMatchingAnalysisPrompt(
    parsedCV: ParsedDataDto,
    jobDescription: string,
    jobSkills: string[],
    jobLevel?: string,
  ): string {
    return `
You are an expert HR analyst and recruiter. Analyze how well this candidate matches the job requirements.

CANDIDATE PROFILE:
${JSON.stringify(parsedCV, null, 2)}

JOB REQUIREMENTS:
Position Level: ${jobLevel || 'Not specified'}
Required Skills: ${jobSkills.join(', ')}
Job Description:
${jobDescription}

ANALYSIS TASK:
Provide a comprehensive matching analysis in JSON format (ONLY JSON, no other text).

Required JSON structure:
{
  "matchingScore": <number 0-100>,
  "skillsMatch": [
    {
      "skill": "skill name from job requirements",
      "matched": true/false,
      "proficiencyLevel": "beginner/intermediate/advanced/expert"
    }
  ],
  "strengths": ["strength 1", "strength 2", "strength 3", ...],
  "weaknesses": ["gap/weakness 1", "gap/weakness 2", ...],
  "experienceMatch": "brief analysis of how experience aligns with requirements",
  "educationMatch": "brief analysis of education fit",
  "summary": "2-3 sentence overall assessment",
  "recommendation": "HIGHLY_RECOMMENDED / RECOMMENDED / CONSIDER / NOT_RECOMMENDED"
}

SCORING CRITERIA (0-100):
- Skills Match: 40 points
  * Award points for each matched skill
  * Consider proficiency level
  * Deduct for missing critical skills
  
- Experience Relevance: 30 points
  * Years of experience vs required
  * Relevant industry/domain experience
  * Position level match
  
- Education Fit: 15 points
  * Degree level appropriateness
  * Major/field relevance
  * Prestigious institutions (bonus)
  
- Overall Profile: 15 points
  * Professional summary quality
  * Career progression
  * Additional qualifications

SCORE INTERPRETATION:
- 85-100: EXCELLENT - Top candidate, immediate interview
- 70-84: GOOD - Strong candidate, priority review
- 50-69: MODERATE - Potential candidate, consider carefully
- 30-49: WEAK - Significant gaps, likely not suitable
- 0-29: POOR - Not a good match

IMPORTANT:
- Be objective and data-driven
- Consider both hard and soft skills
- Account for transferable skills
- Return ONLY valid JSON, no markdown or extra text

Return ONLY the JSON object now:
`;
  }

  /**
   * Extract JSON from AI response
   */
  private extractJSON<T>(text: string): T {
    try {
      // Remove markdown code blocks if present
      let cleanedText = text.trim();
      
      // Remove ```json and ``` markers
      cleanedText = cleanedText.replace(/```json\s*/gi, '');
      cleanedText = cleanedText.replace(/```\s*/g, '');
      
      // Find JSON object
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      this.logger.error('Failed to extract JSON:', error);
      throw new Error(`JSON extraction failed: ${error.message}`);
    }
  }

  /**
   * Make API request with rate limiting and exponential backoff retry
   */
  private async makeRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    retryCount: number = 0,
  ): Promise<T> {
    try {
      // Rate limiting: Ensure minimum interval between requests
      await this.enforceRateLimit();

      // Execute request
      return await requestFn();
    } catch (error) {
      const isRateLimitError = this.isRateLimitError(error);
      const shouldRetry = retryCount < this.MAX_RETRIES && isRateLimitError;

      if (shouldRetry) {
        const retryDelay = this.calculateRetryDelay(error, retryCount);
        
        this.logger.warn(
          `Rate limit hit. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`,
        );

        // Wait before retry
        await this.sleep(retryDelay);

        // Retry request
        return this.makeRequestWithRetry(requestFn, retryCount + 1);
      }

      // Max retries exceeded or non-rate-limit error
      throw error;
    }
  }

  /**
   * Enforce rate limiting by waiting if needed
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      this.logger.debug(`Rate limiting: Waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    const errorMessage = error?.message || '';
    return (
      errorMessage.includes('429') ||
      errorMessage.includes('Too Many Requests') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(error: any, retryCount: number): number {
    // Try to extract suggested retry delay from error
    const errorMessage = error?.message || '';
    const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
    
    if (retryMatch) {
      const suggestedDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000);
      this.logger.debug(`Using API suggested retry delay: ${suggestedDelay}ms`);
      return Math.min(suggestedDelay, this.MAX_RETRY_DELAY);
    }

    // Exponential backoff: initialDelay * (2 ^ retryCount)
    const exponentialDelay = this.INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    const delayWithJitter = exponentialDelay + Math.random() * 1000; // Add jitter
    
    return Math.min(delayWithJitter, this.MAX_RETRY_DELAY);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get token usage estimation
   * Average tokens: 1 token ≈ 4 characters
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Extract contact info using regex as fallback
   */
  private extractContactInfoWithRegex(text: string): { email?: string; phone?: string } {
    const result: { email?: string; phone?: string } = {};

    // Email regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatch = text.match(emailRegex);
    if (emailMatch && emailMatch.length > 0) {
      result.email = emailMatch[0];
    }

    // Phone regex (supports various formats)
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch && phoneMatch.length > 0) {
      result.phone = phoneMatch[0].trim();
    }

    return result;
  }
}
