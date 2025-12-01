import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument, Message } from './schemas/conversation.schema';
import { GeminiService } from '../gemini/gemini.service';
import { CvProfilesService } from '../cv-profiles/cv-profiles.service';
import { UsersService } from '../users/users.service';
import { JobsService } from '../jobs/jobs.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationHistoryResponseDto } from './dto/conversation-history.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  
  // Constants
  private readonly MAX_HISTORY_MESSAGES = 10; // Keep last 10 messages for context
  private readonly MAX_CONVERSATION_LENGTH = 100; // Archive after 100 messages

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    private geminiService: GeminiService,
    private cvProfilesService: CvProfilesService,
    private usersService: UsersService,
    private jobsService: JobsService,
  ) {}

  /**
   * Send message to AI and get response
   */
  async sendMessage(userId: string, message: string): Promise<ChatResponseDto> {
    try {
      this.validateUserId(userId);
      this.logger.log(`Processing message from user ${userId}`);

      // 1. Get or create conversation
      const conversation = await this.getOrCreateConversation(userId);

      // 2. Build user context (includes matching jobs from database)
      const userContext = await this.buildUserContext(userId);

      // 3. Get conversation history (last N messages for context)
      const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);

      // 4. Build system prompt with guardrails and job data
      const systemPrompt = this.buildSystemPrompt(userContext);

      // 5. Call Gemini AI with context and strict guidelines (returns JSON)
      const rawAiResponse = await this.geminiService.chatWithContext(
        message,
        history,
        systemPrompt
      );

      // 6. Parse JSON response (Structured Output)
      let parsedResponse: { text: string; recommendedJobIds: string[] };
      try {
        // Clean response - AI might wrap JSON in markdown code blocks
        const cleanJson = rawAiResponse
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        
        parsedResponse = JSON.parse(cleanJson);
        
        // Validate structure
        if (!parsedResponse.text || !Array.isArray(parsedResponse.recommendedJobIds)) {
          throw new Error('Invalid JSON structure');
        }
      } catch (error) {
        this.logger.warn(`Failed to parse AI JSON response: ${error.message}. Falling back to plain text.`);
        // Fallback: treat entire response as text if JSON parsing fails
        parsedResponse = {
          text: rawAiResponse,
          recommendedJobIds: [],
        };
      }

      // 7. Map job IDs to full job objects (for frontend to render as cards)
      const recommendedJobs = userContext.matchingJobs.filter((job: any) =>
        parsedResponse.recommendedJobIds.includes(job._id.toString())
      );

      // 8. Save both user message and AI response (only save text, not job data)
      const userMessage: Message = {
        role: 'user',
        content: message,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        role: 'assistant',
        content: parsedResponse.text, // Save only conversational text
        timestamp: new Date(),
      };

      conversation.messages.push(userMessage, assistantMessage);

      // 9. Check if conversation is getting too long
      if (conversation.messages.length > this.MAX_CONVERSATION_LENGTH) {
        await this.archiveLongConversation(conversation);
      } else {
        await conversation.save();
      }

      // 10. Extract suggested actions (optional enhancement)
      const suggestedActions = this.extractSuggestedActions(parsedResponse.text, userContext);

      this.logger.log(`Successfully generated AI response for user ${userId}`);

      return {
        conversationId: conversation._id.toString(),
        response: parsedResponse.text, // Return only conversational text
        timestamp: new Date(),
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined, // Structured Output: job cards data
      };
    } catch (error) {
      this.logger.error(`Error sending message for user ${userId}:`, error);
      
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        throw new BadRequestException(
          'AI service is currently busy. Please try again in a few seconds.'
        );
      }
      
      throw new BadRequestException(
        `Failed to process message: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Build user context for AI (includes matching jobs from database)
   */
  private async buildUserContext(userId: string): Promise<any> {
    try {
      const [user, cvProfile] = await Promise.all([
        this.usersService.findOne(userId).catch(() => null),
        this.cvProfilesService.findByUserId(userId).catch(() => null),
      ]);

      // Extract user skills from CV profile
      const userSkills = cvProfile?.skills?.map(s => s.name || s) || [];

      // Find matching jobs based on user skills from database
      const matchingJobs = await this.jobsService.findMatchingJobs(userSkills, 5);

      // Get applied jobs count
      let appliedJobsCount = 0;
      if (cvProfile && cvProfile.appliedJobs) {
        appliedJobsCount = cvProfile.appliedJobs.length;
      }

      return {
        user: user ? {
          name: user.name,
          email: user.email,
        } : null,
        profile: cvProfile ? {
          skills: userSkills,
          experience: cvProfile.experience || [],
          education: cvProfile.education || [],
          summary: cvProfile.summary,
          yearsOfExperience: cvProfile.yearsOfExperience,
        } : null,
        matchingJobs: matchingJobs, // Real job data from database
        appliedJobsCount: appliedJobsCount,
      };
    } catch (error) {
      this.logger.warn(`Error building user context for ${userId}:`, error);
      // Return minimal context if error
      return {
        user: null,
        profile: null,
        matchingJobs: [],
        appliedJobsCount: 0,
      };
    }
  }

  /**
   * Build system prompt with strict guardrails and JSON output format
   * This prevents AI from answering off-topic questions and enforces Structured Output
   */
  private buildSystemPrompt(context: any): string {
    // Format matching jobs for AI context - include _id for job card mapping
    const jobsData = context.matchingJobs?.map((job: any) => ({
      id: job._id.toString(), // CRITICAL: AI needs ID to recommend specific jobs
      name: job.name,
      company: job.company?.name || 'N/A',
      location: job.location || 'N/A',
      level: job.level || 'N/A',
      skills: job.skills || [],
    })) || [];

    const profileData = context.profile || {};
    const userData = context.user || {};

    return `
ROLE:
You are an expert AI Career Advisor for "IT Job Portal" (Vietnam). 
Your goal is to help IT professionals find jobs, improve their CVs, and prepare for interviews.

CONTEXT DATA:
- User Name: ${userData.name || 'User'}
- User Profile: ${JSON.stringify(profileData)}
- Recommended Jobs from Database: ${JSON.stringify(jobsData)}
- Applied Jobs Count: ${context.appliedJobsCount || 0}

STRICT RULES (GUARDRAILS):
1. **SCOPE RESTRICTION**: You must ONLY answer questions related to:
   - Job searching and career advice in IT field
   - Analyzing the user's CV/Profile and suggesting improvements
   - Suggesting jobs from the "Recommended Jobs" list provided above
   - Interview preparation tips for IT positions
   - Salary insights and negotiation for IT jobs in Vietnam
   - Technical skills and learning paths for IT careers
   - Company culture and work environment in IT industry

2. **REFUSAL POLICY**: If the user asks about anything NOT related to careers, jobs, CVs, interviews, or IT skills, you MUST politely refuse.
   - Example off-topic questions: cooking, politics, general knowledge, weather, creative stories, health advice, etc.
   - Refusal template (Vietnamese): "Xin lỗi, tôi là trợ lý tư vấn nghề nghiệp IT và chỉ có thể hỗ trợ bạn các vấn đề liên quan đến tìm việc, CV, phỏng vấn và phát triển sự nghiệp trong lĩnh vực công nghệ thông tin. Bạn có câu hỏi nào về nghề nghiệp không?"
   - Refusal template (English): "I'm sorry, I'm an IT career advisor and can only help with job searching, CV improvement, interviews, and IT career development. Do you have any career-related questions?"

3. **JOB SUGGESTION PRIORITY**: 
   - When user asks for job recommendations, ALWAYS prioritize jobs from "Recommended Jobs" list
   - Include the job IDs in the "recommendedJobIds" array (see OUTPUT FORMAT below)
   - Mention specific details: company name, job title, location, required skills
   - Explain why the job matches their profile (based on their skills)
   - If no matching jobs available, suggest updating skills or expanding search criteria

4. **OUTPUT FORMAT (JSON ONLY - CRITICAL)**:
   You MUST output a valid JSON object in this exact format:
   {
     "text": "Your response in Vietnamese/English with Markdown formatting",
     "recommendedJobIds": ["job_id_1", "job_id_2"]
   }
   
   IMPORTANT: 
   - DO NOT output plain text or Markdown outside this JSON structure
   - DO NOT wrap JSON in markdown code blocks
   - The "text" field should contain your conversational response
   - The "recommendedJobIds" array should contain IDs from "Recommended Jobs from Database" context
   - If user does not ask for jobs, set recommendedJobIds to empty array []

5. **DATA ACCURACY**: 
   - NEVER make up or fabricate job listings
   - Only refer to jobs in the "Recommended Jobs" data
   - If data is missing (N/A), acknowledge it honestly
   - Use real data from user's profile when giving advice

5. **TONE & LANGUAGE**: 
   - Professional, encouraging, and concise
   - Use Vietnamese when user speaks Vietnamese
   - Use English when user speaks English
   - Be supportive and motivational

6. **FORMATTING**: 
   - Use Markdown formatting (bold, bullet points, headings)
   - Keep responses under 300 words unless detailed analysis is requested
   - Structure answers clearly with sections

7. **PRIVACY**: 
   - Never share or discuss other users' data
   - Focus only on the current user's context

REMEMBER: Your purpose is ONLY career counseling for IT professionals. Stay within this scope at all times.
`;
  }

  /**
   * Get conversation history with pagination
   */
  async getConversationHistory(
    userId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<ConversationHistoryResponseDto> {
    try {
      this.validateUserId(userId);
      this.validatePagination(page, limit);

      const conversation = await this.conversationModel
        .findOne({ 
          userId: new Types.ObjectId(userId), 
          isActive: true 
        })
        .lean()
        .exec();

      if (!conversation || !conversation.messages) {
        return { 
          messages: [], 
          total: 0,
          page,
          limit
        };
      }

      // Sort messages by timestamp in ascending order (oldest → newest)
      // This ensures consistent ordering with how frontend adds new messages
      const sortedMessages = [...conversation.messages].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const total = sortedMessages.length;
      
      // Calculate pagination - get most recent messages
      const startIndex = Math.max(0, total - (page * limit));
      const endIndex = total;
      
      const messages = sortedMessages.slice(startIndex, endIndex);

      return { 
        messages, 
        total,
        page,
        limit
      };
    } catch (error) {
      this.logger.error(`Error fetching conversation history for user ${userId}:`, error);
      throw new BadRequestException('Failed to fetch conversation history');
    }
  }

  /**
   * Clear conversation by marking as inactive
   */
  async clearConversation(userId: string): Promise<{ message: string }> {
    try {
      this.validateUserId(userId);

      const result = await this.conversationModel.updateOne(
        { 
          userId: new Types.ObjectId(userId), 
          isActive: true 
        },
        { 
          $set: { isActive: false } 
        }
      );
      
      if (result.modifiedCount > 0) {
        this.logger.log(`Conversation cleared for user ${userId}`);
      }

      return { message: 'Conversation cleared successfully' };
    } catch (error) {
      this.logger.error(`Error clearing conversation for user ${userId}:`, error);
      throw new BadRequestException('Failed to clear conversation');
    }
  }

  /**
   * Get or create active conversation for user
   */
  private async getOrCreateConversation(userId: string): Promise<ConversationDocument> {
    let conversation = await this.conversationModel
      .findOne({ 
        userId: new Types.ObjectId(userId), 
        isActive: true 
      })
      .exec();
    
    if (!conversation) {
      conversation = await this.conversationModel.create({ 
        userId: new Types.ObjectId(userId), 
        messages: [],
        isActive: true
      });
      
      this.logger.log(`Created new conversation for user ${userId}`);
    }

    return conversation;
  }

  /**
   * Archive long conversation and create new one
   */
  private async archiveLongConversation(conversation: ConversationDocument): Promise<void> {
    try {
      // Mark current conversation as inactive
      conversation.isActive = false;
      await conversation.save();

      this.logger.log(`Archived long conversation ${conversation._id}`);
    } catch (error) {
      this.logger.error('Error archiving conversation:', error);
      // Still save the conversation even if archiving fails
      await conversation.save();
    }
  }

  /**
   * Extract suggested actions from AI response
   */
  private extractSuggestedActions(
    aiResponse: string, 
    userContext: any
  ): string[] {
    const actions: string[] = [];

    // Simple keyword-based action extraction
    const lowerResponse = aiResponse.toLowerCase();

    if (!userContext.cvProfile && lowerResponse.includes('cv')) {
      actions.push('Create your CV profile');
    }

    if (userContext.savedJobs?.length === 0 && lowerResponse.includes('job')) {
      actions.push('Browse jobs matching your skills');
    }

    if (lowerResponse.includes('skill') || lowerResponse.includes('learn')) {
      actions.push('Update your skills in CV');
    }

    if (lowerResponse.includes('apply') || lowerResponse.includes('ứng tuyển')) {
      actions.push('View recommended jobs');
    }

    return actions.slice(0, 3); // Max 3 suggestions
  }

  /**
   * Validate user ID format
   */
  private validateUserId(userId: string): void {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }
  }

  /**
   * Validate pagination parameters
   */
  private validatePagination(page: number, limit: number): void {
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }
  }
}
