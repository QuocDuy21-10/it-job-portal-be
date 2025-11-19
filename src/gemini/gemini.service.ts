import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { log } from 'console';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: GenerativeModel;

  // Model configuration
  private readonly MODEL_NAME = 'gemini-2.5-flash';
  private readonly PARSE_MAX_TOKENS = 5000;
  private readonly PARSE_TEMPERATURE = 0.3;
  private readonly PARSE_TOP_P = 1;
  private readonly PARSE_TOP_K = 50;

  // Rate limiting configuration (Gemini 2.5 Flash FREE tier: RPM=10, TPM=250K, RPD=250)
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 5000; // 5 seconds
  private readonly MAX_RETRY_DELAY = 60000; // 60 seconds
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 6000; // 6 seconds between requests (10 RPM = 1 req per 6s)

  

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
            topP: this.PARSE_TOP_P,
            topK: this.PARSE_TOP_K,
            maxOutputTokens: this.PARSE_MAX_TOKENS,
          },
        });
      });
      
      const response = result.response;
      log(response);
      const text = response.text();
      console.log(text);
      console.log("EXtractJSON");

      // Parse JSON response
      const parsedData = this.extractJSON<ParsedDataDto>(text);
      console.log("parsedData: ", parsedData);
      
      this.logger.log('CV parsed successfully');
      return parsedData;
    } catch (error) {
      this.logger.error('Error parsing CV:', error);
      throw new Error(`CV parsing failed: ${error.message}`);
    }
  }

  //  Build prompt for CV parsing
  private buildCVParsingPrompt(cvText: string): string {
    return `
You are an expert CV parser. Extract information from the CV text below.
Return ONLY a valid JSON object matching this structure:

{
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "company": "string | null",
      "position": "string | null",
      "duration": "string (e.g., Jan 2020 - Present) | null",
      "description": "string | null"
    }
  ],
  "education": [
    {
      "school": "string | null",
      "degree": "string | null",
      "major": "string | null",
      "duration": "string (e.g., 2016-2020) | null",
      "gpa": "string | null"
    }
  ],
  "summary": "string | null",
  "yearsOfExperience": "number | null"
}

RULES:
- Extract all relevant soft and technical skills (skills are in uppercase).
- Calculate total years of work experience from dates.
- If info is missing, use null or empty array [].

CV TEXT:
${cvText}

Return ONLY the valid JSON object.
`;
  }

  //  Extract JSON from AI response
  private extractJSON<T>(text: string): T {
    try {
      console.log("EXtractJSON");
      
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

  //  Make API request with rate limiting and exponential backoff retry
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

    // Enforce rate limiting by waiting if needed
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

  

  //  Check if error is a rate limit error
public isRateLimitError(error: any): boolean {
    const errorMessage = error?.message || '';
    return (
      errorMessage.includes('429') ||
      errorMessage.includes('Too Many Requests') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    );
  }

  //  Calculate retry delay with exponential backoff
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

  //  Sleep for specified milliseconds
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  //  Get token usage estimation
  //  Average tokens: 1 token ≈ 4 characters
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
