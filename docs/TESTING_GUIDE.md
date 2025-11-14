# 🧪 Testing Guide - CV Parser & AI Matching

## Prerequisites

1. **Services Running:**

   ```bash
   # Redis
   redis-server

   # MongoDB
   # Check your docker-compose or local MongoDB

   # Application
   npm run dev
   ```

2. **Test Data:**
   - Sample CV files (PDF, DOCX, TXT)
   - Valid job ID from database
   - User authentication token

---

## 🔄 Full Flow Test

### Step 1: Login & Get Token

```bash
# Login
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Save the access_token from response
export TOKEN="your_access_token_here"
```

### Step 2: Get Active Job ID

```bash
# List jobs
curl -X GET "http://localhost:8081/jobs?page=1&limit=10&isActive=true" \
  -H "Authorization: Bearer $TOKEN"

# Save a jobId from response
export JOB_ID="507f1f77bcf86cd799439011"
```

### Step 3: Upload CV

```bash
# Create test CV file
cat > test_cv.txt << 'EOF'
JOHN DOE
Software Engineer

Contact:
Email: john.doe@example.com
Phone: +84 123 456 789

SUMMARY
Experienced backend developer with 5+ years in Node.js, NestJS, and microservices.

SKILLS
- NestJS, TypeScript, Node.js
- MongoDB, Redis, PostgreSQL
- Docker, Kubernetes, AWS
- Microservices, REST API, GraphQL
- CI/CD, Git, Agile

EXPERIENCE

Senior Backend Developer | Tech Corp | Jan 2021 - Present
- Led development of microservices architecture using NestJS
- Implemented Redis caching improving performance by 40%
- Managed team of 3 developers
- Technologies: NestJS, MongoDB, Redis, Docker

Backend Developer | Startup Inc | Jun 2019 - Dec 2020
- Developed RESTful APIs serving 100k+ daily users
- Implemented CI/CD pipelines with GitHub Actions
- Technologies: Node.js, PostgreSQL, Docker

EDUCATION

Bachelor of Computer Science | University of Technology | 2015 - 2019
GPA: 3.8/4.0
EOF

# Upload CV
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_cv.txt" \
  -F "jobId=$JOB_ID"

# Save resumeId from response
export RESUME_ID="507f1f77bcf86cd799439012"
```

**Expected Response:**

```json
{
  "statusCode": 201,
  "message": "CV uploaded and queued for processing",
  "data": {
    "resumeId": "...",
    "status": "processing",
    "jobs": {
      "parseJobId": "...",
      "analysisJobId": "..."
    }
  }
}
```

### Step 4: Monitor Processing

```bash
# Wait 5 seconds
sleep 5

# Check queue stats
curl -X GET http://localhost:8081/resumes/queue/stats \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**

```json
{
  "data": {
    "waiting": 1,
    "active": 1,
    "completed": 0,
    "failed": 0
  }
}
```

### Step 5: Get Analysis Results

```bash
# Wait for processing (30-60 seconds total)
sleep 45

# Get results
curl -X GET http://localhost:8081/resumes/$RESUME_ID/analysis \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "isParsed": true,
    "isAnalyzed": true,
    "parsedData": {
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "skills": ["NestJS", "TypeScript", ...],
      "yearsOfExperience": 5
    },
    "aiAnalysis": {
      "matchingScore": 87,
      "priority": "EXCELLENT",
      "recommendation": "HIGHLY_RECOMMENDED"
    }
  }
}
```

---

## 🧪 Test Cases

### Test 1: Valid PDF Upload

```bash
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample_cv.pdf" \
  -F "jobId=$JOB_ID"

# Expected: 201 Created
```

### Test 2: Invalid File Type

```bash
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@image.jpg" \
  -F "jobId=$JOB_ID"

# Expected: 400 Bad Request
# Message: "Invalid file type"
```

### Test 3: File Too Large

```bash
# Create large file (> 5MB)
dd if=/dev/zero of=large_file.pdf bs=1M count=6

curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large_file.pdf" \
  -F "jobId=$JOB_ID"

# Expected: 400 Bad Request
# Message: "File too large"
```

### Test 4: Duplicate Application

```bash
# Upload CV twice for same job
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cv.pdf" \
  -F "jobId=$JOB_ID"

# Wait a bit, then try again
sleep 2

curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cv.pdf" \
  -F "jobId=$JOB_ID"

# Expected: 400 Bad Request
# Message: "You have already applied to this job"
```

### Test 5: Invalid Job ID

```bash
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cv.pdf" \
  -F "jobId=invalidid123"

# Expected: 404 Not Found
# Message: "Job not found"
```

### Test 6: Inactive Job

```bash
# Use jobId of an inactive job
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cv.pdf" \
  -F "jobId=$INACTIVE_JOB_ID"

# Expected: 400 Bad Request
# Message: "This job is no longer active"
```

### Test 7: Re-parse CV

```bash
curl -X POST http://localhost:8081/resumes/$RESUME_ID/reparse \
  -H "Authorization: Bearer $TOKEN"

# Expected: 201 Created
# Message: "Re-parsing queued successfully"
```

### Test 8: Re-analyze CV

```bash
curl -X POST http://localhost:8081/resumes/$RESUME_ID/reanalyze \
  -H "Authorization: Bearer $TOKEN"

# Expected: 201 Created
# Message: "Re-analysis queued successfully"
```

---

## 📊 Monitoring

### Check Redis Queue

```bash
# Connect to Redis
redis-cli

# Check queue keys
KEYS "bull:resume-processing:*"

# Check waiting jobs
LLEN "bull:resume-processing:waiting"

# Check active jobs
LLEN "bull:resume-processing:active"

# Monitor real-time
MONITOR
```

### Check MongoDB

```bash
# Connect to MongoDB
mongosh

use my-job-portal

# Find resumes with parsing status
db.resumes.find({ isParsed: true }).pretty()

# Find resumes by priority
db.resumes.find({ priority: "EXCELLENT" }).pretty()

# Check analysis scores
db.resumes.find({
  "aiAnalysis.matchingScore": { $gte: 85 }
}).pretty()
```

### Check Application Logs

```bash
# Watch logs
npm run dev

# Look for:
# ✅ [GeminiService] CV parsed successfully
# ✅ [ResumeQueueProcessor] Successfully parsed CV
# ✅ [ResumeQueueProcessor] Successfully analyzed resume
# ❌ [ResumeQueueProcessor] Failed to parse CV
```

---

## 🔍 Debug Tools

### 1. Test Gemini API Directly

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{
      "parts":[{"text": "Parse this CV: John Doe, email: john@example.com"}]
    }]
  }'
```

### 2. Test PDF Parsing

```javascript
// Test in Node REPL
const pdfParse = require('pdf-parse');
const fs = require('fs');

const dataBuffer = fs.readFileSync('./test.pdf');
pdfParse(dataBuffer).then(data => {
  console.log('Text length:', data.text.length);
  console.log('First 500 chars:', data.text.substring(0, 500));
});
```

### 3. Check File Upload Path

```bash
# Check if file was saved
ls -la public/images/resumes/

# Check file permissions
stat public/images/resumes/cv-*.pdf
```

---

## 📈 Performance Testing

### Load Test with Multiple CVs

```bash
#!/bin/bash

# Upload 10 CVs concurrently
for i in {1..10}; do
  curl -X POST http://localhost:8081/resumes/upload-cv \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test_cv.txt" \
    -F "jobId=$JOB_ID" &
done

wait

echo "All uploads completed"

# Check queue stats
sleep 5
curl -X GET http://localhost:8081/resumes/queue/stats \
  -H "Authorization: Bearer $TOKEN"
```

### Measure Processing Time

```bash
# Start time
START=$(date +%s)

# Upload CV
RESPONSE=$(curl -s -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_cv.txt" \
  -F "jobId=$JOB_ID")

RESUME_ID=$(echo $RESPONSE | jq -r '.data.resumeId')

# Poll until analyzed
while true; do
  RESULT=$(curl -s -X GET http://localhost:8081/resumes/$RESUME_ID/analysis \
    -H "Authorization: Bearer $TOKEN")

  IS_ANALYZED=$(echo $RESULT | jq -r '.data.processing.isAnalyzed')

  if [ "$IS_ANALYZED" = "true" ]; then
    END=$(date +%s)
    DURATION=$((END - START))
    echo "Processing completed in $DURATION seconds"
    break
  fi

  sleep 2
done
```

---

## ✅ Success Criteria

- [ ] CV upload succeeds with valid file
- [ ] File validation rejects invalid files
- [ ] Parsing extracts correct information
- [ ] AI analysis returns score 0-100
- [ ] Priority is calculated correctly
- [ ] Duplicate check prevents re-application
- [ ] Queue processing completes in < 60s
- [ ] Error handling works for all edge cases
- [ ] Re-parse and re-analyze work correctly
- [ ] All logs show appropriate messages

---

## 🐛 Common Issues & Solutions

### Issue: "Redis connection failed"

```bash
# Solution: Start Redis
redis-server

# Or check if running
redis-cli ping
```

### Issue: "Gemini API error"

```bash
# Solution: Check API key
grep GEMINI_API_KEY .env

# Test API key
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```

### Issue: "File not found"

```bash
# Solution: Check file path and permissions
ls -la public/images/resumes/
chmod 755 public/images/resumes/
```

### Issue: "Job expired"

```bash
# Solution: Update job endDate
mongosh
use my-job-portal
db.jobs.updateOne(
  { _id: ObjectId("YOUR_JOB_ID") },
  { $set: { endDate: new Date("2025-12-31") } }
)
```

---

**Testing Complete!** 🎉
Ready for production deployment.
