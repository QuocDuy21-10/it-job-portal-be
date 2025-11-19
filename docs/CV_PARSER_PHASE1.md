# CV Parser & AI Matching Pipeline - Phase 1 Documentation

## 📋 Overview

Hệ thống CV Parser & AI Matching Pipeline giúp tự động phân tích CV ứng viên và matching với yêu cầu công việc sử dụng AI (Gemini 2.5 Flash).

## 🏗️ Architecture

### 1. Database Schema

#### Resume Schema (Updated)

```typescript
{
  // Existing fields
  email: string
  userId: ObjectId
  url: string
  status: ResumeStatus
  companyId: ObjectId
  jobId: ObjectId

  // NEW: Parsed CV Data
  parsedData: {
    fullName: string
    email: string
    phone: string
    skills: string[]
    experience: [{
      company: string
      position: string
      duration: string
      description: string
    }]
    education: [{
      school: string
      degree: string
      major: string
      duration: string
      gpa: string (optional)
    }]
    summary: string
    yearsOfExperience: number
  }

  // NEW: AI Analysis
  aiAnalysis: {
    matchingScore: number (0-100)
    skillsMatch: [{
      skill: string
      matched: boolean
      proficiencyLevel: string
    }]
    strengths: string[]
    weaknesses: string[]
    summary: string
    recommendation: string
    analyzedAt: Date
  }

  // NEW: Priority & Metadata
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT'
  adminNotes: string
  hrNotes: string
  isParsed: boolean
  isAnalyzed: boolean
  parseError: string
  analysisError: string
}
```

**Indexes:**

- `{ status: 1, priority: 1 }`
- `{ companyId: 1, status: 1, priority: 1 }` (compound)
- `{ 'aiAnalysis.matchingScore': -1 }`
- `{ jobId: 1, status: 1 }`
- `{ userId: 1, createdAt: -1 }`
- `{ isParsed: 1, isAnalyzed: 1 }`

#### Job Schema (Updated)

**New Indexes:**

- `{ 'company._id': 1, isActive: 1, isDeleted: 1 }`
- `{ isActive: 1, endDate: 1, isDeleted: 1 }`
- `{ skills: 1 }`
- `{ level: 1 }`
- `{ location: 1 }`
- `{ createdAt: -1 }`
- Text index: `{ name: 'text', description: 'text' }`

### 2. Modules Structure

```
src/
├── gemini/
│   ├── gemini.module.ts
│   └── gemini.service.ts          # AI service for CV parsing & analysis
├── cv-parser/
│   ├── cv-parser.module.ts
│   └── cv-parser.service.ts       # File parsing (PDF, DOCX, TXT)
├── redis/
│   └── redis.module.ts            # Redis config for Queue & Cache
├── queues/
│   ├── queues.module.ts
│   ├── services/
│   │   └── resume-queue.service.ts
│   └── processors/
│       └── resume-queue.processor.ts
└── resumes/
    ├── schemas/resume.schema.ts   # Updated schema
    ├── enums/
    │   └── resume-priority.enum.ts
    └── dto/
        ├── parsed-data.dto.ts
        └── ai-analysis.dto.ts
```

## 🔧 Technologies

### Dependencies

- **File Processing:**
  - `pdf-parse` - Parse PDF files
  - `mammoth` - Parse DOCX files
- **AI Integration:**
  - `@google/generative-ai` - Gemini AI SDK
- **Queue & Cache:**
  - `@nestjs/bullmq` - Queue management
  - `bullmq` - Redis-based queue
  - `ioredis` - Redis client
  - `@nestjs/cache-manager` - Cache management
  - `cache-manager-redis-store` - Redis cache store

### AI Model Configuration

- **Model:** `gemini-2.0-flash-exp`
- **Max Output Tokens:** 4096
- **Temperature:** 0.7
- **Use Case:** CV parsing + Job matching analysis

### Redis Configuration

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_QUEUE_DB=0      # Queue database
REDIS_CACHE_DB=1      # Cache database
REDIS_TTL=3600        # 1 hour default cache TTL
```

## 🚀 Core Services

### 1. GeminiService

**Purpose:** AI-powered CV parsing and job matching

**Methods:**

- `parseCV(cvText: string)` - Extract structured data from CV text
- `analyzeResumeJobMatch(parsedCV, jobDescription, jobSkills)` - Calculate matching score
- `estimateTokens(text: string)` - Token usage estimation

**Prompts:**

- CV Parsing: Extracts name, email, phone, skills, experience, education
- Job Matching: Scores 0-100 based on skills (40%), experience (30%), education (15%), overall (15%)

### 2. CvParserService

**Purpose:** Extract text from various file formats

**Supported Formats:**

- PDF (`.pdf`)
- Word (`.doc`, `.docx`)
- Text (`.txt`)

**Methods:**

- `extractTextFromCV(filePath: string)` - Main extraction method
- `validateExtractedText(text: string)` - Quality validation
- `cleanText(text: string)` - Normalize text
- `fileExists(filePath: string)` - File validation

**Validation Rules:**

- Min length: 100 characters
- Max length: 50,000 characters
- Min words: 50

### 3. ResumeQueueService

**Purpose:** Manage background jobs

**Job Types:**

1. **parse-resume** - Parse CV file
   - Priority: 1
   - Retry: 3 attempts
   - Backoff: Exponential (2s base)

2. **analyze-resume** - AI analysis
   - Priority: 2
   - Retry: 3 attempts
   - Backoff: Exponential (2s base)

**Methods:**

- `addParseResumeJob(data)` - Queue CV parsing
- `addAnalyzeResumeJob(data)` - Queue AI analysis
- `getQueueStats()` - Monitor queue health
- `cleanOldJobs(grace)` - Cleanup old jobs

### 4. ResumeQueueProcessor

**Purpose:** Process background jobs

**Configuration:**

- Concurrency: 5 jobs parallel
- Rate limit: 10 jobs/second

**Processing Flow:**

**Parse Resume:**

1. Check cache for parsed data
2. Extract text from file
3. Validate text quality
4. Clean and normalize text
5. Parse with Gemini AI
6. Update database
7. Cache result (1 hour)

**Analyze Resume:**

1. Fetch resume + job data
2. Validate resume is parsed
3. Perform AI analysis
4. Calculate priority score
5. Update database

**Priority Calculation:**

- EXCELLENT: Score ≥ 85
- HIGH: Score ≥ 70
- MEDIUM: Score ≥ 50
- LOW: Score < 50

## 📊 Performance Optimizations

### 1. Database Indexes

- Compound indexes for common queries
- Index on matching score for sorting
- Index on priority for filtering

### 2. Caching Strategy

- Cache parsed CV data (1 hour)
- Redis cache for frequently accessed data
- Reduces AI API calls

### 3. Queue Management

- Job retry with exponential backoff
- Auto-cleanup old jobs
- Rate limiting to prevent API throttling

### 4. Token Usage Optimization

- Efficient prompts
- Text validation before processing
- Estimated token calculation

## 🔐 Environment Variables

```env
# Gemini AI
GEMINI_API_KEY=your_api_key

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_QUEUE_DB=0
REDIS_CACHE_DB=1
REDIS_TTL=3600
```

## 📝 Usage Examples

### Queue a CV Parsing Job

```typescript
await resumeQueueService.addParseResumeJob({
  resumeId: '507f1f77bcf86cd799439011',
  filePath: '/path/to/cv.pdf',
});
```

### Queue an Analysis Job

```typescript
await resumeQueueService.addAnalyzeResumeJob({
  resumeId: '507f1f77bcf86cd799439011',
  jobId: '507f1f77bcf86cd799439012',
});
```

### Get Queue Statistics

```typescript
const stats = await resumeQueueService.getQueueStats();
// Returns: { waiting, active, completed, failed, delayed, total }
```

## 🎯 Next Steps (Phase 2)

1. **API Endpoints** - REST API for CV management
2. **Webhook Integration** - Real-time notifications
3. **Batch Processing** - Process multiple CVs
4. **Analytics Dashboard** - Queue monitoring
5. **Error Handling** - Advanced error recovery
6. **Testing** - Unit & Integration tests

## ⚠️ Important Notes

1. **Redis Required:** Ensure Redis server is running before starting the app
2. **File Permissions:** CV files must be readable by the application
3. **API Limits:** Monitor Gemini API usage and quotas
4. **Token Costs:** Each CV parsing ~500-1000 tokens, analysis ~1000-2000 tokens
5. **Queue Workers:** Can scale horizontally by adding more workers

## 🐛 Error Handling

- Parse errors stored in `resume.parseError`
- Analysis errors stored in `resume.analysisError`
- Failed jobs retained for 7 days
- Automatic retry with exponential backoff
- Detailed logging for debugging

---

**Created:** Phase 1 - Setup & Design
**Last Updated:** {{ current_date }}
