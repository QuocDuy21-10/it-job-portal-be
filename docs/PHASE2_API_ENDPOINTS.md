# 📡 PHASE 2 - API ENDPOINTS Documentation

## Overview

Complete REST API endpoints for CV Parser & AI Matching Pipeline with full request/response examples.

---

## 🚀 Main Endpoints

### 1. Upload CV & Auto-Process

**Endpoint:** `POST /resumes/upload-cv`

**Description:** Upload CV file and automatically trigger parsing + AI analysis

**Authentication:** Required (JWT)

**Request:**

```bash
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/cv.pdf" \
  -F "jobId=507f1f77bcf86cd799439011"
```

**Form Data:**

- `file`: CV file (PDF, DOC, DOCX, TXT - Max 5MB)
- `jobId`: MongoDB ObjectId of the job to apply for

**Success Response (201):**

```json
{
  "statusCode": 201,
  "message": "CV uploaded and queued for processing",
  "data": {
    "resumeId": "507f1f77bcf86cd799439012",
    "jobId": "507f1f77bcf86cd799439011",
    "jobName": "Senior Backend Developer",
    "companyName": "Tech Company Inc.",
    "status": "processing",
    "jobs": {
      "parseJobId": "1234567890",
      "analysisJobId": "0987654321"
    },
    "file": {
      "filename": "cv-1699999999999.pdf",
      "originalName": "john_doe_cv.pdf",
      "mimetype": "application/pdf",
      "size": 245760,
      "sizeInMB": "0.24",
      "uploadedAt": "2025-11-14T10:30:00.000Z"
    },
    "message": "Your CV has been uploaded and is being processed. You will be notified when analysis is complete.",
    "estimatedTime": "30-60 seconds"
  }
}
```

**Error Responses:**

_400 - Invalid file type:_

```json
{
  "statusCode": 400,
  "message": "Invalid file type: image/jpeg. Only PDF, DOC, DOCX, and TXT are allowed."
}
```

_400 - File too large:_

```json
{
  "statusCode": 400,
  "message": "File too large: 6.50MB. Maximum size is 5MB."
}
```

_400 - Duplicate application:_

```json
{
  "statusCode": 400,
  "message": "You have already applied to this job. Duplicate applications are not allowed."
}
```

_404 - Job not found:_

```json
{
  "statusCode": 404,
  "message": "Job not found with id: 507f1f77bcf86cd799439011"
}
```

_400 - Job not active:_

```json
{
  "statusCode": 400,
  "message": "This job is no longer active"
}
```

---

### 2. Get Analysis Results

**Endpoint:** `GET /resumes/:id/analysis`

**Description:** Retrieve parsed CV data and AI matching analysis

**Authentication:** Required (JWT)

**Request:**

```bash
curl -X GET http://localhost:8081/resumes/507f1f77bcf86cd799439012/analysis \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (200):**

```json
{
  "statusCode": 200,
  "message": "Analysis results retrieved successfully",
  "data": {
    "resumeId": "507f1f77bcf86cd799439012",
    "jobId": "507f1f77bcf86cd799439011",
    "companyId": "507f1f77bcf86cd799439010",
    "status": "PENDING",
    "processing": {
      "isParsed": true,
      "isAnalyzed": true,
      "parseError": null,
      "analysisError": null
    },
    "parsedData": {
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "phone": "+84 123 456 789",
      "skills": ["NestJS", "TypeScript", "MongoDB", "Redis", "Docker", "Microservices", "AWS"],
      "experience": [
        {
          "company": "Tech Corp",
          "position": "Senior Backend Developer",
          "duration": "Jan 2021 - Present",
          "description": "Led development of microservices architecture using NestJS and MongoDB"
        },
        {
          "company": "Startup Inc",
          "position": "Backend Developer",
          "duration": "Jun 2019 - Dec 2020",
          "description": "Developed RESTful APIs and implemented CI/CD pipelines"
        }
      ],
      "education": [
        {
          "school": "University of Technology",
          "degree": "Bachelor",
          "major": "Computer Science",
          "duration": "2015 - 2019",
          "gpa": "3.8/4.0"
        }
      ],
      "summary": "Experienced backend developer with 5+ years specializing in Node.js and microservices",
      "yearsOfExperience": 5
    },
    "aiAnalysis": {
      "matchingScore": 87,
      "skillsMatch": [
        {
          "skill": "NestJS",
          "matched": true,
          "proficiencyLevel": "advanced"
        },
        {
          "skill": "MongoDB",
          "matched": true,
          "proficiencyLevel": "advanced"
        },
        {
          "skill": "Redis",
          "matched": true,
          "proficiencyLevel": "intermediate"
        },
        {
          "skill": "GraphQL",
          "matched": false,
          "proficiencyLevel": null
        }
      ],
      "strengths": [
        "Strong experience with NestJS and TypeScript",
        "Proven track record in microservices architecture",
        "Excellent backend development skills",
        "Good understanding of cloud technologies"
      ],
      "weaknesses": ["Missing GraphQL experience", "Limited front-end skills mentioned"],
      "experienceMatch": "Candidate has 5 years of relevant backend experience, which aligns well with the senior position requirements. Experience with similar tech stack is a strong plus.",
      "educationMatch": "Bachelor's degree in Computer Science from a reputable university with good GPA. Meets the educational requirements.",
      "summary": "Excellent candidate with strong technical skills and relevant experience. Highly recommended for interview.",
      "recommendation": "HIGHLY_RECOMMENDED",
      "analyzedAt": "2025-11-14T10:31:30.000Z"
    },
    "priority": "EXCELLENT",
    "notes": {
      "adminNotes": null,
      "hrNotes": null
    },
    "uploadedAt": "2025-11-14T10:30:00.000Z",
    "lastUpdated": "2025-11-14T10:31:30.000Z"
  }
}
```

**Processing Response (Still being processed):**

```json
{
  "statusCode": 200,
  "message": "Analysis results retrieved successfully",
  "data": {
    "resumeId": "507f1f77bcf86cd799439012",
    "status": "PENDING",
    "processing": {
      "isParsed": true,
      "isAnalyzed": false,
      "parseError": null,
      "analysisError": null
    },
    "parsedData": {
      /* ... parsed data ... */
    },
    "aiAnalysis": null,
    "priority": "LOW",
    "message": "Analysis is still in progress. Please check back in a few moments."
  }
}
```

---

### 3. Get Queue Statistics

**Endpoint:** `GET /resumes/queue/stats`

**Description:** View current CV processing queue status

**Authentication:** Required (Admin only recommended)

**Request:**

```bash
curl -X GET http://localhost:8081/resumes/queue/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (200):**

```json
{
  "statusCode": 200,
  "message": "Queue statistics retrieved",
  "data": {
    "waiting": 5,
    "active": 2,
    "completed": 143,
    "failed": 3,
    "delayed": 0,
    "total": 153
  }
}
```

---

### 4. Re-parse CV

**Endpoint:** `POST /resumes/:id/reparse`

**Description:** Trigger re-parsing of an already uploaded CV

**Authentication:** Required

**Request:**

```bash
curl -X POST http://localhost:8081/resumes/507f1f77bcf86cd799439012/reparse \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (201):**

```json
{
  "statusCode": 201,
  "message": "Re-parsing queued successfully",
  "data": {
    "resumeId": "507f1f77bcf86cd799439012",
    "jobId": "1234567890",
    "message": "CV re-parsing has been queued"
  }
}
```

---

### 5. Re-analyze CV

**Endpoint:** `POST /resumes/:id/reanalyze`

**Description:** Trigger re-analysis of a parsed CV

**Authentication:** Required

**Request:**

```bash
curl -X POST http://localhost:8081/resumes/507f1f77bcf86cd799439012/reanalyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (201):**

```json
{
  "statusCode": 201,
  "message": "Re-analysis queued successfully",
  "data": {
    "resumeId": "507f1f77bcf86cd799439012",
    "jobId": "0987654321",
    "message": "CV re-analysis has been queued"
  }
}
```

---

## 🔄 Complete Flow Example

### Step 1: Upload CV

```bash
# Upload CV for a job
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@cv.pdf" \
  -F "jobId=507f1f77bcf86cd799439011"

# Response: Get resumeId
```

### Step 2: Wait for Processing

```bash
# Processing happens in background
# Typically takes 30-60 seconds
# - Parse job: 15-30s
# - Analysis job: 15-30s
```

### Step 3: Check Results

```bash
# Get analysis results
curl -X GET http://localhost:8081/resumes/507f1f77bcf86cd799439012/analysis \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check priority and matching score
```

---

## 📊 Priority Levels

| Score Range | Priority  | Description         | Action              |
| ----------- | --------- | ------------------- | ------------------- |
| 85-100      | EXCELLENT | Top candidate       | Immediate interview |
| 70-84       | HIGH      | Strong candidate    | Priority review     |
| 50-69       | MEDIUM    | Potential candidate | Consider carefully  |
| 0-49        | LOW       | Not a good match    | Likely reject       |

---

## ⚡ Performance Notes

- **File Upload:** < 1s
- **CV Parsing:** 15-30s (depends on file size and complexity)
- **AI Analysis:** 15-30s (depends on job description length)
- **Total Processing Time:** 30-60s

---

## 🔐 Security

- JWT authentication required for all endpoints
- Users can only view their own resumes
- Admins can view all resumes
- File validation prevents malicious uploads
- Size limits prevent DoS attacks

---

## 🐛 Error Handling

All errors follow consistent format:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "BadRequest"
}
```

Common errors:

- 400: Bad Request (validation failed)
- 401: Unauthorized (no/invalid token)
- 403: Forbidden (no permission)
- 404: Not Found
- 413: Payload Too Large
- 422: Unprocessable Entity (invalid file type)
- 500: Internal Server Error

---

## 📝 Postman Collection

Import this collection for testing:

```json
{
  "info": {
    "name": "CV Parser & AI Matching",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Upload CV",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": "/path/to/cv.pdf"
            },
            {
              "key": "jobId",
              "value": "507f1f77bcf86cd799439011",
              "type": "text"
            }
          ]
        },
        "url": {
          "raw": "{{baseUrl}}/resumes/upload-cv",
          "host": ["{{baseUrl}}"],
          "path": ["resumes", "upload-cv"]
        }
      }
    }
  ]
}
```

---

**Phase 2 Complete!** ✨
All backend processing flow implemented with comprehensive API endpoints.
