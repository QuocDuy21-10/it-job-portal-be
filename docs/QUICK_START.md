# 🚀 Quick Start Guide - CV Parser & AI Matching

## Prerequisites

1. **Redis Server** (Required for Queue & Cache)

   ```bash
   # macOS
   brew install redis
   brew services start redis

   # Ubuntu
   sudo apt-get install redis-server
   sudo systemctl start redis

   # Check if running
   redis-cli ping  # Should return "PONG"
   ```

2. **MongoDB** (Already configured)

3. **Node.js** v16+ (Already installed)

## Setup

### 1. Run Setup Script

```bash
cd /Users/dinhduy/Desktop/Workspace/graduation-project/my-job-portal-be
./scripts/setup-cv-parser.sh
```

### 2. Verify Environment Variables

Ensure `.env` contains:

```env
# Gemini AI
GEMINI_API_KEY=your_key_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_QUEUE_DB=0
REDIS_CACHE_DB=1
REDIS_TTL=3600
```

### 3. Start Application

```bash
npm run dev
```

## 📝 Usage Examples

### Example 1: Parse a CV File

```typescript
// In your controller or service
import { ResumeQueueService } from './queues/services/resume-queue.service';

constructor(
  private readonly resumeQueueService: ResumeQueueService
) {}

async uploadAndParseCV(file: Express.Multer.File, resumeId: string) {
  // Add to queue
  await this.resumeQueueService.addParseResumeJob({
    resumeId: resumeId,
    filePath: file.path
  });

  return { message: 'CV is being processed' };
}
```

### Example 2: Analyze CV for Job Match

```typescript
async analyzeResume(resumeId: string, jobId: string) {
  await this.resumeQueueService.addAnalyzeResumeJob({
    resumeId: resumeId,
    jobId: jobId
  });

  return { message: 'Analysis in progress' };
}
```

### Example 3: Check Queue Status

```typescript
async getQueueStatus() {
  const stats = await this.resumeQueueService.getQueueStats();
  return stats;
  // Returns: { waiting, active, completed, failed, delayed, total }
}
```

## 🔍 Monitoring

### Redis Queue Monitoring

```bash
# View all jobs in queue
redis-cli KEYS "bull:resume-processing:*"

# Count jobs by status
redis-cli LLEN "bull:resume-processing:waiting"
redis-cli LLEN "bull:resume-processing:active"

# Clear all queue data (BE CAREFUL!)
redis-cli FLUSHDB
```

### Application Logs

```bash
# Watch logs
npm run dev

# Look for:
# ✅ [GeminiService] Gemini AI Service initialized
# ✅ [ResumeQueueProcessor] Processing job...
# ✅ [CvParserService] Extracted X characters from PDF
```

## 📊 Data Flow

```
1. Upload CV
   ↓
2. Queue Parse Job
   ↓
3. Extract Text (PDF/DOCX)
   ↓
4. Parse with Gemini AI
   ↓
5. Save Parsed Data + Cache
   ↓
6. Queue Analysis Job
   ↓
7. Match with Job Requirements
   ↓
8. Calculate Score & Priority
   ↓
9. Save Analysis Results
```

## 🎯 Priority Levels

- **EXCELLENT** (85-100): Top candidates, immediate interview
- **HIGH** (70-84): Strong candidates, review soon
- **MEDIUM** (50-69): Potential candidates, consider
- **LOW** (0-49): Not a good match

## 🐛 Troubleshooting

### Redis Connection Error

```bash
# Check Redis status
redis-cli ping

# Restart Redis
# macOS
brew services restart redis

# Ubuntu
sudo systemctl restart redis
```

### Parse Errors

- Check file format (PDF, DOCX, TXT only)
- Verify file size < 10MB
- Ensure file is readable
- Check logs for specific error

### Analysis Errors

- Ensure CV is parsed first (isParsed = true)
- Check job data exists
- Verify Gemini API key is valid
- Check API quota limits

## 📚 API Documentation

See full documentation in `docs/CV_PARSER_PHASE1.md`

## 🧪 Testing

### Manual Test

```bash
# 1. Start Redis
redis-server

# 2. Start app
npm run dev

# 3. Upload a CV via your API endpoint
# 4. Check Resume document for:
#    - isParsed: true
#    - parsedData: {...}
#    - aiAnalysis: {...}
#    - priority: "HIGH"
```

## 📦 What's Included

### ✅ Phase 1 - COMPLETE

- [x] Database Schema (Resume + Job)
- [x] Indexes Optimization
- [x] Gemini AI Integration
- [x] CV Parser (PDF/DOCX/TXT)
- [x] Redis Queue Setup
- [x] Background Job Processor
- [x] Cache Strategy
- [x] Error Handling
- [x] Priority System

### 🔜 Phase 2 - Next Steps

- [ ] REST API Endpoints
- [ ] Webhook Notifications
- [ ] Batch Processing
- [ ] Admin Dashboard
- [ ] Unit Tests
- [ ] Integration Tests

## 💡 Tips

1. **Cache Management**: Parsed CVs are cached for 1 hour
2. **Rate Limiting**: Max 10 jobs/second to avoid API throttling
3. **Retries**: Failed jobs retry 3 times with exponential backoff
4. **Cleanup**: Old jobs auto-cleanup after 24 hours (completed) / 7 days (failed)
5. **Scaling**: Can add more workers for parallel processing

## 🤝 Support

For issues or questions, check:

- Application logs
- Redis logs: `redis-cli MONITOR`
- Database records
- Queue statistics

---

**Phase 1 Complete** ✨
Ready for Phase 2: API Implementation
