# 🎓 Hybrid CV Matching - Phân Tích & Đề Xuất Kiến Trúc

## 📋 MỤC LỤC

1. [Phân Tích Ưu/Nhược Điểm](#1-phân-tích-ưunhược-điểm)
2. [Đề Xuất Kiến Trúc](#2-đề-xuất-kiến-trúc)
3. [Pseudocode & Code Mẫu](#3-pseudocode--code-mẫu)
4. [Scoring Formula Chi Tiết](#4-scoring-formula-chi-tiết)
5. [Best Practices](#5-best-practices)

---

## 1. PHÂN TÍCH ƯU/NHƯỢC ĐIỂM

### ✅ Ưu Điểm Của Hybrid Approach

| Khía Cạnh                 | Chi Tiết                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **Tách Biệt Trách Nhiệm** | AI làm extraction (strength của AI), Backend làm business logic (strength của code) |
| **Kiểm Soát Hoàn Toàn**   | Logic matching trong code → dễ debug, test, customize                               |
| **Chi Phí Thấp Hơn**      | Chỉ 1 AI call (parse CV) thay vì 2 calls (parse + match) → giảm 50% chi phí         |
| **Performance Tốt**       | Matching logic chạy local (~50ms) vs AI API call (~5s) → nhanh hơn 100x             |
| **Dễ Maintain**           | Business rules trong constants → thay đổi không cần sửa code logic                  |
| **Testable**              | Unit test được từng function → quality assurance tốt hơn                            |
| **Transparent**           | Biết chính xác cách score được tính → không còn AI black box                        |
| **Flexible**              | A/B testing các scoring formula khác nhau dễ dàng                                   |

### ⚠️ Nhược Điểm Cần Lưu Ý

| Vấn Đề                   | Giải Pháp                                   |
| ------------------------ | ------------------------------------------- |
| **Code Phức Tạp Hơn**    | Documentation tốt, code comments rõ ràng    |
| **Cần Update Rules**     | Centralize trong constants, version control |
| **Thiếu Context**        | Bổ sung ML-based similarity trong phase 2   |
| **Manual Skill Mapping** | Build skill ontology dần dần                |
| **Initial Setup**        | One-time effort, sau đó dễ maintain         |

### 🆚 So Sánh: AI-Only vs Hybrid

```
┌────────────────────────────────────────────────────────────┐
│              AI-ONLY APPROACH                              │
├────────────────────────────────────────────────────────────┤
│  1. Upload CV → Parse (AI) → 3-5s                         │
│  2. Analyze Match (AI) → 5-7s                             │
│  3. Total: ~8-12s, 2 API calls, High cost                 │
│                                                             │
│  ❌ Slow                                                   │
│  ❌ Expensive                                              │
│  ❌ Black box (không biết cách tính)                       │
│  ❌ Hard to debug                                          │
│  ❌ Cannot customize easily                                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│              HYBRID APPROACH (Recommended)                 │
├────────────────────────────────────────────────────────────┤
│  1. Upload CV → Parse (AI) → 3-5s                         │
│  2. Analyze Match (Backend Logic) → 50-100ms              │
│  3. Total: ~3-6s, 1 API call, Low cost                    │
│                                                             │
│  ✅ Fast (50% faster)                                      │
│  ✅ Cheap (50% cost reduction)                             │
│  ✅ Transparent (biết chính xác logic)                     │
│  ✅ Easy to debug (logs, unit tests)                       │
│  ✅ Highly customizable (config-based)                     │
└────────────────────────────────────────────────────────────┘
```

---

## 2. ĐỀ XUẤT KIẾN TRÚC

### 📂 Folder Structure (Clean & Modular)

```
src/
├── cv-parser/                          # Module 1: File Processing
│   ├── cv-parser.module.ts
│   ├── cv-parser.service.ts            # pdf-parse logic
│   └── dto/
│       └── extracted-text.dto.ts
│
├── gemini/                             # Module 2: AI Integration
│   ├── gemini.module.ts
│   ├── gemini.service.ts
│   │   ├── parseCV()                   # ✅ Main: Extract JSON
│   │   └── analyzeResumeJobMatch()     # ⚠️ Deprecated
│   └── dto/
│
├── matching/                           # ⭐ Module 3: Scoring Engine (NEW)
│   ├── matching.module.ts
│   ├── matching.service.ts             # Core matching logic
│   ├── constants/
│   │   └── matching.constants.ts       # All business rules
│   ├── dto/
│   │   ├── match-result.dto.ts
│   │   └── skill-match.dto.ts
│   ├── examples/
│   │   └── usage.examples.ts
│   └── README.md
│
├── resumes/                            # Module 4: Resume Management
│   ├── resumes.module.ts               # Imports MatchingModule
│   ├── resumes.service.ts
│   ├── resumes.controller.ts
│   └── schemas/
│       └── resume.schema.ts
│
└── queues/                             # Module 5: Background Jobs
    ├── queues.module.ts                # Imports MatchingModule
    ├── processors/
    │   └── resume-queue.processor.ts   # Uses MatchingService
    └── services/
        └── resume-queue.service.ts
```

### 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID PIPELINE FLOW                          │
└─────────────────────────────────────────────────────────────────┘

   USER UPLOADS CV (PDF/DOCX)
          │
          ▼
   ┌──────────────────┐
   │ ResumesController│
   │  .create()       │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ ResumeQueueService       │
   │  .addParseJob()          │  ← Add to BullMQ
   └────────┬─────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────┐
   │ BACKGROUND JOB: parse-resume            │
   │                                         │
   │  Step 1: CvParserService                │
   │    └─→ extractTextFromCV()              │  ← pdf-parse
   │        Returns: rawText (string)        │
   │                                         │
   │  Step 2: CvParserService                │
   │    └─→ cleanText()                      │  ← Remove noise
   │        Returns: cleanedText             │
   │                                         │
   │  Step 3: GeminiService                  │
   │    └─→ parseCV(cleanedText)             │  ← AI Extract
   │        Returns: parsedData {            │
   │          fullName, email, phone,        │
   │          skills[], experience[],        │
   │          education[], yearsOfExperience │
   │        }                                │
   │                                         │
   │  Step 4: Update Database                │
   │    Resume.update({                      │
   │      parsedData,                        │
   │      isParsed: true                     │
   │    })                                   │
   └─────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ ResumeQueueService       │
   │  .addAnalyzeJob()        │  ← Add analysis job
   └────────┬─────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────┐
   │ BACKGROUND JOB: analyze-resume          │
   │                                         │
   │  Step 1: Fetch Data                     │
   │    ├─→ Resume.findById(resumeId)        │
   │    └─→ Job.findById(jobId)              │
   │                                         │
   │  Step 2: MatchingService                │  ⭐ NEW: Backend Scoring
   │    └─→ calculateMatch(parsedCV, job)    │
   │                                         │
   │        ├─→ calculateSkillsMatch()       │  50% weight
   │        │     • Fuzzy matching           │
   │        │     • Proficiency detection    │
   │        │                                │
   │        ├─→ calculateExperienceScore()   │  30% weight
   │        │     • Years vs job level       │
   │        │     • Over-qualified check     │
   │        │                                │
   │        ├─→ calculateEducationScore()    │  20% weight
   │        │     • Degree level matching    │
   │        │                                │
   │        ├─→ calculateWeightedScore()     │
   │        │     Total = Skills*0.5 +       │
   │        │             Exp*0.3 +          │
   │        │             Edu*0.2            │
   │        │                                │
   │        ├─→ determinePriority()          │
   │        │     • EXCELLENT (≥85)          │
   │        │     • HIGH (≥70)               │
   │        │     • MEDIUM (≥50)             │
   │        │     • LOW (<50)                │
   │        │                                │
   │        └─→ determineAutoStatus()        │
   │              • APPROVED (score≥85)      │
   │              • REJECTED (score<30)      │
   │              • REVIEWING (default)      │
   │                                         │
   │  Step 3: Update Database                │
   │    Resume.update({                      │
   │      aiAnalysis: {                      │
   │        matchingScore,                   │
   │        skillsMatch[],                   │
   │        strengths[],                     │
   │        weaknesses[],                    │
   │        summary,                         │
   │        recommendation                   │
   │      },                                 │
   │      priority,                          │
   │      status,  ← Auto set!               │
   │      isAnalyzed: true                   │
   │    })                                   │
   └─────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────┐
   │  HR Dashboard    │
   │  View Results    │
   └──────────────────┘
```

---

## 3. PSEUDOCODE & CODE MẪU

### 3.1. MatchingService - Core Logic

```typescript
/**
 * PSEUDOCODE: MatchingService.calculateMatch()
 */

FUNCTION calculateMatch(parsedCV, job):
    // ========== STEP 1: Skills Matching (50% weight) ==========

    candidateSkills = parsedCV.skills  // ['JavaScript', 'React', ...]
    requiredSkills = job.skills        // ['JavaScript', 'TypeScript', ...]

    skillsResult = {
        matches: [],
        matchedCount: 0,
        totalRequired: requiredSkills.length
    }

    FOR EACH requiredSkill IN requiredSkills:
        // Fuzzy matching
        isMatched = FALSE

        FOR EACH candidateSkill IN candidateSkills:
            IF normalizeSkill(candidateSkill) === normalizeSkill(requiredSkill):
                isMatched = TRUE
                BREAK
            END IF

            // Check variations (e.g., "js" matches "javascript")
            IF skillVariationsMatch(candidateSkill, requiredSkill):
                isMatched = TRUE
                BREAK
            END IF
        END FOR

        IF isMatched:
            skillsResult.matchedCount += 1
            proficiency = detectProficiency(requiredSkill, candidateSkills)
            score = getProficiencyScore(proficiency)  // expert=100, advanced=85, etc.

            skillsResult.matches.push({
                skill: requiredSkill,
                matched: TRUE,
                proficiencyLevel: proficiency,
                score: score
            })
        ELSE:
            skillsResult.matches.push({
                skill: requiredSkill,
                matched: FALSE,
                proficiencyLevel: 'none',
                score: 0
            })
        END IF
    END FOR

    // Calculate skills score percentage
    skillsScore = (matchedCount / totalRequired) * 100


    // ========== STEP 2: Experience Matching (30% weight) ==========

    candidateYears = parsedCV.yearsOfExperience  // e.g., 3
    jobLevel = job.level                          // e.g., 'JUNIOR'

    // Get expectations for job level
    levelConfig = EXPERIENCE_SCORING[jobLevel]
    // e.g., JUNIOR: { minYears: 1, maxYears: 3, idealYears: 2 }

    IF candidateYears < levelConfig.minYears:
        // Below minimum
        ratio = candidateYears / levelConfig.minYears
        experienceScore = ratio * 50  // Max 50 points if below min

    ELSE IF candidateYears <= levelConfig.idealYears:
        // Between min and ideal
        range = levelConfig.idealYears - levelConfig.minYears
        position = candidateYears - levelConfig.minYears
        experienceScore = 50 + (position / range) * 50  // 50-100 points

    ELSE IF candidateYears <= levelConfig.maxYears:
        // Perfect range
        experienceScore = 100

    ELSE:
        // Over-qualified (slight penalty)
        overYears = candidateYears - levelConfig.maxYears
        penalty = MIN(overYears * 2, 15)  // Max 15 point penalty
        experienceScore = 100 - penalty
    END IF


    // ========== STEP 3: Education Matching (20% weight) ==========

    education = parsedCV.education

    IF education IS EMPTY:
        educationScore = 50  // Neutral
    ELSE:
        hasPhD = checkForDegree(education, 'PhD')
        hasMaster = checkForDegree(education, 'Master')
        hasBachelor = checkForDegree(education, 'Bachelor')

        SWITCH jobLevel:
            CASE 'INTERN', 'JUNIOR':
                educationScore = hasBachelor OR hasMaster OR hasPhD ? 100 : 75
            CASE 'MID_LEVEL':
                educationScore = hasBachelor ? 90 : (hasMaster OR hasPhD ? 100 : 50)
            CASE 'SENIOR', 'LEAD', 'MANAGER':
                educationScore = hasPhD OR hasMaster ? 100 : (hasBachelor ? 70 : 40)
            DEFAULT:
                educationScore = 50
        END SWITCH
    END IF


    // ========== STEP 4: Calculate Weighted Total Score ==========

    totalScore = (skillsScore * 0.5) + (experienceScore * 0.3) + (educationScore * 0.2)
    totalScore = CLAMP(totalScore, 0, 100)  // Ensure 0-100 range


    // ========== STEP 5: Determine Priority ==========

    IF totalScore >= 85:
        priority = 'EXCELLENT'
    ELSE IF totalScore >= 70:
        priority = 'HIGH'
    ELSE IF totalScore >= 50:
        priority = 'MEDIUM'
    ELSE:
        priority = 'LOW'
    END IF


    // ========== STEP 6: Determine Auto Status ==========

    criticalSkillsMatchRate = (matchedCount / totalRequired) * 100

    IF totalScore >= 85 AND criticalSkillsMatchRate >= 70:
        autoStatus = 'APPROVED'  // Auto approve excellent candidates
    ELSE IF totalScore < 30 AND criticalSkillsMatchRate < 30:
        autoStatus = 'REJECTED'  // Auto reject poor matches
    ELSE:
        autoStatus = 'REVIEWING'  // Default: manual review
    END IF


    // ========== STEP 7: Generate Insights ==========

    strengths = []
    weaknesses = []

    IF skillsScore >= 80:
        strengths.push("Excellent skills match")
    ELSE IF skillsScore < 50:
        weaknesses.push("Limited skills match")
    END IF

    IF experienceScore >= 90:
        strengths.push("Strong experience")
    ELSE IF experienceScore < 50:
        weaknesses.push("Experience gap")
    END IF


    // ========== STEP 8: Generate Summary & Recommendation ==========

    summary = generateSummary(totalScore, matchedCount, totalRequired)
    recommendation = generateRecommendation(totalScore)


    // ========== RETURN RESULT ==========

    RETURN {
        matchingScore: ROUND(totalScore),
        priority: priority,
        autoStatus: autoStatus,
        skillsMatch: skillsResult.matches,
        skillsMatchPercentage: skillsScore,
        experienceScore: experienceScore,
        educationScore: educationScore,
        strengths: strengths,
        weaknesses: weaknesses,
        summary: summary,
        recommendation: recommendation,
        analyzedAt: NOW()
    }
END FUNCTION
```

### 3.2. ResumeQueueProcessor - Integration

```typescript
/**
 * PSEUDOCODE: ResumeQueueProcessor.handleAnalyzeResume()
 */

FUNCTION handleAnalyzeResume(job):
    resumeId = job.data.resumeId
    jobId = job.data.jobId

    TRY:
        // Step 1: Fetch data from database
        resume = Database.findResume(resumeId)
        jobData = Database.findJob(jobId)

        IF NOT resume.parsedData:
            THROW ERROR "Resume must be parsed before analysis"
        END IF

        IF NOT jobData.isActive:
            THROW ERROR "Job is no longer active"
        END IF


        // Step 2: Call MatchingService (Backend Scoring)
        matchResult = MatchingService.calculateMatch(
            resume.parsedData,
            jobData
        )


        // Step 3: Convert to AIAnalysis format (backward compatibility)
        analysis = {
            matchingScore: matchResult.matchingScore,
            skillsMatch: matchResult.skillsMatch,
            strengths: matchResult.strengths,
            weaknesses: matchResult.weaknesses,
            summary: matchResult.summary,
            recommendation: matchResult.recommendation,
            analyzedAt: matchResult.analyzedAt
        }


        // Step 4: Update database with results
        Database.updateResume(resumeId, {
            aiAnalysis: analysis,
            priority: matchResult.priority,
            status: matchResult.autoStatus,  // Auto set status!
            isAnalyzed: TRUE,
            analysisError: NULL
        })


        // Step 5: Log success
        LOG "✅ Successfully analyzed resume ${resumeId}"
        LOG "   Score: ${matchResult.matchingScore}"
        LOG "   Priority: ${matchResult.priority}"
        LOG "   Status: ${matchResult.autoStatus}"

        RETURN {
            success: TRUE,
            analysis: analysis,
            priority: matchResult.priority,
            autoStatus: matchResult.autoStatus
        }

    CATCH error:
        // Handle errors
        LOG "❌ Failed to analyze resume ${resumeId}: ${error.message}"

        Database.updateResume(resumeId, {
            isAnalyzed: FALSE,
            analysisError: error.message
        })

        THROW error
    END TRY
END FUNCTION
```

### 3.3. ResumesModule - Module Setup

```typescript
/**
 * CODE MẪU: ResumesModule
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './schemas/resume.schema';
import { MatchingModule } from 'src/matching/matching.module'; // ⭐ Import

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Resume.name, schema: ResumeSchema }]),
    MatchingModule, // ⭐ Add MatchingModule
  ],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
```

---

## 4. SCORING FORMULA CHI TIẾT

### 4.1. Skills Matching Formula

```
Input:
  candidateSkills = ['JavaScript', 'React', 'Node.js']
  requiredSkills = ['JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS']

Processing:
  1. Normalize all skills (lowercase, trim, remove special chars)
  2. For each required skill:
     - Check exact match
     - Check fuzzy match (variations)
     - If matched: assign proficiency score

  Matched Skills:
    ✅ JavaScript   → intermediate → 70 points
    ❌ TypeScript   → none → 0 points
    ✅ React        → intermediate → 70 points
    ✅ Node.js      → intermediate → 70 points
    ❌ AWS          → none → 0 points

  Total Points = 70 + 0 + 70 + 70 + 0 = 210
  Max Possible = 5 skills × 100 points = 500

  Skills Score = (210 / 500) × 100 = 42%

Formula:
  skillsScore = (Σ matchedPoints / (totalRequired × 100)) × 100
```

### 4.2. Experience Matching Formula

```
Example: Junior Developer Position
  Config: { minYears: 1, maxYears: 3, idealYears: 2 }

Case 1: Candidate has 0.5 years
  → Below minimum
  → Score = (0.5 / 1) × 50 = 25 points

Case 2: Candidate has 1.5 years
  → Between min and ideal
  → range = 2 - 1 = 1
  → position = 1.5 - 1 = 0.5
  → Score = 50 + (0.5 / 1) × 50 = 75 points

Case 3: Candidate has 2 years
  → At ideal
  → Score = 100 points

Case 4: Candidate has 2.5 years
  → Between ideal and max
  → Score = 100 points

Case 5: Candidate has 5 years
  → Over-qualified
  → overYears = 5 - 3 = 2
  → penalty = min(2 × 2, 15) = 4
  → Score = 100 - 4 = 96 points
```

### 4.3. Total Score Calculation

```
Example Calculation:

Skills Score:       60%
Experience Score:   85%
Education Score:    90%

Total = (60 × 0.5) + (85 × 0.3) + (90 × 0.2)
      = 30 + 25.5 + 18
      = 73.5
      = 74 (rounded)

Priority: HIGH (≥70)
Auto Status: REVIEWING (not ≥85)
```

---

## 5. BEST PRACTICES

### 5.1. Configuration Management

```typescript
✅ DO: Centralize in constants
export const MATCHING_WEIGHTS = {
  SKILLS: 0.5,
  EXPERIENCE: 0.3,
  EDUCATION: 0.2,
};

❌ DON'T: Hard-code in service
const totalScore = skillsScore * 0.5 + expScore * 0.3;  // Bad!
```

### 5.2. Error Handling

```typescript
✅ DO: Graceful fallback
try {
  const result = await matchingService.calculateMatch(cv, job);
} catch (error) {
  logger.error('Matching failed', error);
  return defaultResult;  // Fallback
}

❌ DON'T: Silent failure
const result = await matchingService.calculateMatch(cv, job);  // No error handling
```

### 5.3. Testing Strategy

```typescript
✅ DO: Unit test each component
describe('calculateSkillsMatch', () => {
  it('should match JavaScript variants', () => {
    expect(service.isSkillMatch('js', 'javascript')).toBe(true);
  });
});

✅ DO: Integration test full pipeline
it('should process CV end-to-end', async () => {
  const result = await processCV(cvFile);
  expect(result.matchingScore).toBeGreaterThan(0);
});
```

### 5.4. Performance Optimization

```typescript
✅ DO: Cache parsed CV data
const cacheKey = `parsed_cv:${resumeId}`;
const cached = await cacheManager.get(cacheKey);
if (cached) return cached;

✅ DO: Use parallel processing
const matchResults = await Promise.all(
  jobs.map(job => matchingService.calculateMatch(cv, job))
);

❌ DON'T: Sequential processing
for (const job of jobs) {
  await matchingService.calculateMatch(cv, job);  // Slow!
}
```

### 5.5. Monitoring & Logging

```typescript
✅ DO: Log key metrics
logger.log(`Match score: ${score}, Priority: ${priority}`);
logger.log(`Skills: ${matchedCount}/${totalRequired}`);

✅ DO: Track performance
const start = Date.now();
const result = await calculateMatch(cv, job);
const duration = Date.now() - start;
logger.debug(`Matching took ${duration}ms`);
```

---

## 📊 KẾT LUẬN

### ✅ Hybrid Approach Là Khả Thi & Tối Ưu

1. **Separation of Concerns**: AI extract, Backend score → Clean architecture
2. **Cost Effective**: 50% giảm chi phí AI
3. **Performance**: 50-60% nhanh hơn
4. **Maintainable**: Config-based, easy to change
5. **Testable**: Unit tests đầy đủ
6. **Scalable**: Có thể mở rộng thêm scoring criteria

### 🚀 Implementation Ready

- ✅ Code đã được implement đầy đủ
- ✅ Build passing không lỗi
- ✅ Documentation chi tiết
- ✅ Examples & usage guides
- ✅ Configuration flexible

### 📈 Roadmap Phase 2 (Optional)

1. ML-based skill similarity
2. Industry-specific rules
3. A/B testing framework
4. Admin dashboard for tuning
5. Historical data analysis

---

**Status**: ✅ Production Ready  
**Recommendation**: Deploy và monitor, sau đó điều chỉnh constants theo feedback thực tế
