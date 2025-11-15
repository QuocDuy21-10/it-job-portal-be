# 🎯 Hybrid CV Parsing & Matching Architecture

## 📋 Tổng Quan

Hệ thống Hybrid CV Parsing Pipeline kết hợp sức mạnh của AI (Gemini) cho việc **trích xuất dữ liệu** và logic backend tự viết cho việc **tính toán matching score**.

### Triết Lý Thiết Kế

```
┌─────────────────────────────────────────────────────────────┐
│  HYBRID APPROACH: AI Extract + Backend Score                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ✅ AI (Gemini):     Extract structured JSON từ CV text      │
│  ✅ Backend Logic:   Tính toán matching score tự động        │
│  ✅ Separation:      Tách biệt trách nhiệm rõ ràng           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Kiến Trúc Module

### Module Structure

```
src/
├── cv-parser/                 # PDF parsing (pdf-parse)
│   ├── cv-parser.service.ts   # Extract text từ file
│   └── cv-parser.module.ts
│
├── gemini/                    # AI Integration (Gemini)
│   ├── gemini.service.ts      # parseCV() - Extract JSON
│   └── gemini.module.ts       # analyzeResumeJobMatch() @deprecated
│
├── matching/                  # ⭐ NEW: Matching Logic
│   ├── matching.service.ts    # Core scoring engine
│   ├── matching.module.ts
│   ├── constants/
│   │   └── matching.constants.ts  # Business rules, weights
│   └── dto/
│       ├── match-result.dto.ts
│       └── skill-match.dto.ts
│
├── resumes/                   # Resume Management
│   ├── resumes.service.ts
│   ├── resumes.module.ts      # Import MatchingModule
│   └── schemas/resume.schema.ts
│
└── queues/                    # Background Jobs
    ├── processors/
    │   └── resume-queue.processor.ts  # Uses MatchingService
    └── queues.module.ts       # Import MatchingModule
```

---

## 🔄 Luồng Xử Lý (Processing Flow)

### 1️⃣ **CV Upload & Parse**

```typescript
User uploads CV
    ↓
ResumesController.create()
    ↓
ResumeQueueService.addParseJob(resumeId, filePath)
    ↓
[Background Queue]
    ↓
ResumeQueueProcessor.handleParseResume()
    ├── CvParserService.extractTextFromCV()     // pdf-parse
    ├── CvParserService.cleanText()
    └── GeminiService.parseCV(cvText)           // AI extract JSON
        ↓
    Resume.parsedData = { fullName, email, skills, experience, ... }
```

### 2️⃣ **Resume Analysis & Matching**

```typescript
ResumeQueueService.addAnalyzeJob(resumeId, jobId)
    ↓
[Background Queue]
    ↓
ResumeQueueProcessor.handleAnalyzeResume()
    ├── Fetch Resume.parsedData
    ├── Fetch Job data
    └── MatchingService.calculateMatch(parsedCV, job)  // 🆕 Backend scoring
        ├── calculateSkillsMatch()      // 50% weight
        ├── calculateExperienceScore()  // 30% weight
        ├── calculateEducationScore()   // 20% weight
        ├── calculateWeightedScore()
        ├── determinePriority()
        └── determineAutoStatus()
        ↓
    Resume.update({
        aiAnalysis: { matchingScore, strengths, weaknesses, ... },
        priority: EXCELLENT | HIGH | MEDIUM | LOW,
        status: APPROVED | REVIEWING | REJECTED  // Auto status
    })
```

---

## 📊 Scoring Formula

### Weighted Scoring Algorithm

```typescript
Total Score = (Skills × 0.5) + (Experience × 0.3) + (Education × 0.2)

// Range: 0-100
```

### 1. Skills Matching (50% weight)

```typescript
// Logic trong MatchingService.calculateSkillsMatch()

For each required skill:
  - Matched: 100 points (expert), 85 (advanced), 70 (intermediate), 50 (beginner)
  - Not matched: 0 points

Skills Score = (Total Points / (Total Required Skills × 100)) × 100
```

**Features:**

- ✅ Fuzzy matching (JavaScript = js, React.js = react)
- ✅ Skill variations mapping
- ✅ Proficiency level detection
- ✅ Case-insensitive

### 2. Experience Matching (30% weight)

```typescript
// Logic trong MatchingService.calculateExperienceScore()

Experience Score based on Job Level:
├── INTERN:      0-1 years ideal
├── JUNIOR:      1-3 years ideal
├── MID_LEVEL:   2-5 years ideal
├── SENIOR:      4-10 years ideal
├── LEAD:        5-15 years ideal
└── MANAGER:     6-20 years ideal

Scoring:
- Below minimum:        0-50 points (proportional)
- Between min-ideal:    50-100 points (linear)
- At ideal:             100 points
- Over-qualified:       85-100 points (slight penalty)
```

### 3. Education Matching (20% weight)

```typescript
// Logic trong MatchingService.calculateEducationScore()

Score by degree + job level:
├── PhD/Master:       100 points (for Senior+)
├── Bachelor:         80-100 points (depending on level)
└── No degree info:   50 points (neutral)
```

---

## 🎯 Auto Status Rules

```typescript
// Logic trong MatchingService.determineAutoStatus()

AUTO APPROVE:
✅ matchingScore >= 85
✅ criticalSkillsMatchRate >= 70%
→ Status = APPROVED

AUTO REJECT:
❌ matchingScore < 30
❌ criticalSkillsMatchRate < 30%
→ Status = REJECTED

DEFAULT:
⚠️ Other cases
→ Status = REVIEWING
```

---

## 🔧 Configuration (Không Hard-code)

### `matching.constants.ts`

```typescript
// ===== WEIGHTS =====
export const MATCHING_WEIGHTS = {
  SKILLS: 0.5, // Có thể thay đổi dễ dàng
  EXPERIENCE: 0.3,
  EDUCATION: 0.2,
};

// ===== THRESHOLDS =====
export const SCORE_THRESHOLDS = {
  EXCELLENT: 85, // Chỉnh theo business
  HIGH: 70,
  MEDIUM: 50,
  LOW: 30,
};

// ===== PROFICIENCY LEVELS =====
export const SKILL_PROFICIENCY_LEVELS = {
  expert: 100,
  advanced: 85,
  intermediate: 70,
  beginner: 50,
  none: 0,
};

// ===== EXPERIENCE BY LEVEL =====
export const EXPERIENCE_SCORING = {
  [JobLevel.INTERN]: { minYears: 0, maxYears: 1, idealYears: 0 },
  [JobLevel.JUNIOR]: { minYears: 1, maxYears: 3, idealYears: 2 },
  // ... có thể customize
};
```

**Lợi ích:**

- ✅ Dễ điều chỉnh business rules
- ✅ Không cần sửa code logic
- ✅ Centralized configuration
- ✅ Type-safe với TypeScript

---

## 🆚 So Sánh: Trước vs Sau

| Aspect            | ❌ Trước (AI Matching) | ✅ Sau (Hybrid)        |
| ----------------- | ---------------------- | ---------------------- |
| **AI Role**       | Extract + Score        | Extract only           |
| **Scoring Logic** | AI black box           | Backend transparent    |
| **Cost**          | High (2 AI calls)      | Low (1 AI call)        |
| **Control**       | Limited                | Full control           |
| **Debugging**     | Hard                   | Easy                   |
| **Testability**   | Difficult              | Unit testable          |
| **Customization** | Re-prompt AI           | Update constants       |
| **Performance**   | Slower (API calls)     | Faster (local compute) |
| **Reliability**   | AI-dependent           | Deterministic          |

---

## 📐 Best Practices

### 1️⃣ **Separation of Concerns**

```typescript
✅ DO:
- AI chỉ làm extraction (parseCV)
- Backend làm scoring (MatchingService)
- Tách biệt rõ ràng trách nhiệm

❌ DON'T:
- Gọi AI để tính matching score
- Mix business logic vào AI prompt
```

### 2️⃣ **Configuration Management**

```typescript
✅ DO:
- Tất cả weights, thresholds trong constants
- Dễ dàng A/B testing
- Version control cho business rules

❌ DON'T:
- Hard-code số trong service
- Magic numbers
```

### 3️⃣ **Error Handling**

```typescript
✅ DO:
try {
  const result = await matchingService.calculateMatch(cv, job);
  // Handle success
} catch (error) {
  // Fallback logic
  logger.error('Matching failed', error);
}

❌ DON'T:
- Silent failures
- Không có fallback
```

### 4️⃣ **Testing Strategy**

```typescript
// Unit Test MatchingService
describe('MatchingService', () => {
  it('should calculate skills match correctly', () => {
    const result = matchingService.calculateSkillsMatch(
      ['JavaScript', 'React', 'Node.js'],
      ['JavaScript', 'TypeScript', 'React'],
    );
    expect(result.matchedCount).toBe(2);
    expect(result.scorePercentage).toBeGreaterThan(60);
  });

  it('should apply correct weights', () => {
    const score = matchingService.calculateWeightedScore(80, 70, 60);
    // 80*0.5 + 70*0.3 + 60*0.2 = 40 + 21 + 12 = 73
    expect(score).toBe(73);
  });
});
```

### 5️⃣ **Performance Optimization**

```typescript
✅ DO:
- Cache parsed CV data (đã implement)
- Parallel processing với BullMQ
- Database indexes cho queries

❌ DON'T:
- Parse CV nhiều lần
- Gọi AI không cần thiết
```

---

## 🔍 Debugging Guide

### Check Matching Score Details

```typescript
// In logs:
[MatchingService] Starting match calculation for job: Backend Developer (...)
[MatchingService] Skills Match: 7/10 (70%)
[MatchingService] Experience Score: 85
[MatchingService] Education Score: 90
[MatchingService] Total Score: 78 (Weighted)
[MatchingService] Priority: HIGH
[MatchingService] Auto Status: REVIEWING
```

### Common Issues

**Issue 1: Skills not matching**

```typescript
// Check skill variations in constants
SKILL_VARIATIONS = {
  'react.js': ['react', 'reactjs'], // Add more aliases
};
```

**Issue 2: Scores too low/high**

```typescript
// Adjust weights in constants
MATCHING_WEIGHTS = {
  SKILLS: 0.6, // Increase skills weight
  EXPERIENCE: 0.25,
  EDUCATION: 0.15,
};
```

**Issue 3: Wrong priority**

```typescript
// Adjust thresholds
SCORE_THRESHOLDS = {
  EXCELLENT: 90, // Increase to be stricter
  HIGH: 75,
  MEDIUM: 55,
};
```

---

## 🚀 Migration Guide

### Bước 1: Deploy Module Mới

```bash
# Modules đã được tạo:
src/matching/matching.module.ts
src/matching/matching.service.ts
src/matching/constants/matching.constants.ts
src/matching/dto/match-result.dto.ts
src/matching/dto/skill-match.dto.ts
```

### Bước 2: Update Dependencies

```typescript
// queues.module.ts
imports: [
  MatchingModule, // ✅ Added
];

// resumes.module.ts
imports: [
  MatchingModule, // ✅ Added
];
```

### Bước 3: Update Processor

```typescript
// resume-queue.processor.ts
// ❌ Old:
const analysis = await this.geminiService.analyzeResumeJobMatch(...)

// ✅ New:
const matchResult = await this.matchingService.calculateMatch(parsedCV, job)
```

### Bước 4: Test

```bash
# Upload CV mới và kiểm tra:
1. CV parsing hoạt động bình thường
2. Matching score được tính đúng
3. Priority được assign đúng
4. Auto status hoạt động
```

---

## 📈 Monitoring & Metrics

### Key Metrics to Track

```typescript
// Logging in MatchingService
logger.log(`Match calculation - Score: ${score}, Priority: ${priority}`);
logger.log(`Skills matched: ${matchedCount}/${totalRequired}`);
logger.log(`Auto status: ${autoStatus}`);
```

### Performance Metrics

```typescript
// Thời gian xử lý:
- CV Parsing (AI):      ~3-5 seconds
- Matching (Backend):   ~50-100ms
- Total per resume:     ~3-6 seconds

// So với trước (AI Matching):
- Old: ~8-12 seconds (2 AI calls)
- New: ~3-6 seconds (1 AI call)
→ Performance improvement: ~50-60%
```

---

## ✅ Ưu Điểm Của Hybrid Approach

### 1. **Cost Efficiency**

- ✅ Giảm 50% API calls tới Gemini
- ✅ Chỉ dùng AI cho extraction (1 lần)
- ✅ Matching logic chạy local (free)

### 2. **Control & Transparency**

- ✅ Biết chính xác cách score được tính
- ✅ Có thể debug từng component
- ✅ Dễ dàng customize business rules

### 3. **Performance**

- ✅ Matching chạy nhanh hơn 100x (local vs API)
- ✅ Không phụ thuộc vào latency của AI API
- ✅ Có thể cache kết quả dễ dàng

### 4. **Maintainability**

- ✅ Code dễ đọc, dễ hiểu
- ✅ Logic rõ ràng, không black box
- ✅ Unit test được đầy đủ

### 5. **Flexibility**

- ✅ Thay đổi weights theo A/B testing
- ✅ Thêm scoring criteria mới dễ dàng
- ✅ Customize cho từng job category

---

## ⚠️ Limitations & Future Enhancements

### Current Limitations

1. **Fuzzy Matching**: Chưa hỗ trợ ML-based similarity
2. **Context Understanding**: AI có thể hiểu ngữ cảnh tốt hơn
3. **Skill Synonyms**: Cần manual mapping trong constants

### Future Improvements

```typescript
// Phase 2 Enhancements:
1. ML-based skill similarity (embeddings)
2. Industry-specific scoring rules
3. Historical data analysis
4. A/B testing framework
5. Real-time scoring adjustments
```

---

## 📚 References

- [MatchingService Implementation](../src/matching/matching.service.ts)
- [Constants Configuration](../src/matching/constants/matching.constants.ts)
- [Resume Queue Processor](../src/queues/processors/resume-queue.processor.ts)
- [Gemini Service (Deprecated AI Matching)](../src/gemini/gemini.service.ts)

---

## 🤝 Contributing

Khi thêm feature mới vào matching logic:

1. ✅ Update constants trước
2. ✅ Implement logic trong MatchingService
3. ✅ Viết unit tests
4. ✅ Update documentation
5. ✅ Test với real data

---

**Updated**: November 2024  
**Architecture**: Hybrid AI Extraction + Backend Scoring  
**Status**: ✅ Production Ready
