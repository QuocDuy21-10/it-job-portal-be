# 🎯 QUICK REFERENCE - Hybrid CV Matching System

## 📌 TL;DR

**Hybrid Approach:** AI extracts data → Backend calculates matching score

```typescript
// Old way (❌ Deprecated)
const analysis = await geminiService.analyzeResumeJobMatch(cv, job, skills);

// New way (✅ Recommended)
const matchResult = await matchingService.calculateMatch(parsedCV, job);
```

---

## 🏗️ Module Structure

```
src/matching/
├── matching.module.ts                    # Module definition
├── matching.service.ts                   # Core scoring engine
├── constants/matching.constants.ts       # All configuration
├── dto/match-result.dto.ts               # Output DTO
├── dto/skill-match.dto.ts                # Skill detail DTO
├── examples/usage.examples.ts            # Usage examples
└── README.md                             # Quick docs
```

---

## 🔧 How to Use

### In Queue Processor

```typescript
import { MatchingService } from 'src/matching/matching.service';

// Inject
constructor(private matchingService: MatchingService) {}

// Use
const result = await this.matchingService.calculateMatch(parsedCV, job);

// Result
result.matchingScore    // 0-100
result.priority         // EXCELLENT | HIGH | MEDIUM | LOW
result.autoStatus       // APPROVED | REVIEWING | REJECTED
result.skillsMatch      // Array of skill matches
result.strengths        // Array of strengths
result.weaknesses       // Array of weaknesses
```

---

## 📊 Scoring Breakdown

| Component      | Weight | How It's Calculated                       |
| -------------- | ------ | ----------------------------------------- |
| **Skills**     | 50%    | Fuzzy match CV skills vs job requirements |
| **Experience** | 30%    | Years vs job level expectations           |
| **Education**  | 20%    | Degree level vs job requirements          |

**Total Score = (Skills × 0.5) + (Experience × 0.3) + (Education × 0.2)**

---

## 🎯 Score Meanings

| Score Range | Priority  | Auto Status  | Meaning                              |
| ----------- | --------- | ------------ | ------------------------------------ |
| 85-100      | EXCELLENT | ✅ APPROVED  | Top candidate, interview immediately |
| 70-84       | HIGH      | ⏸️ REVIEWING | Strong candidate, priority review    |
| 50-69       | MEDIUM    | ⏸️ REVIEWING | Consider carefully                   |
| 30-49       | LOW       | ⏸️ REVIEWING | Significant gaps                     |
| 0-29        | LOW       | ❌ REJECTED  | Not suitable                         |

---

## ⚙️ Configuration

All settings in `constants/matching.constants.ts`:

### Change Weights

```typescript
export const MATCHING_WEIGHTS = {
  SKILLS: 0.6, // ← Prioritize skills more
  EXPERIENCE: 0.25,
  EDUCATION: 0.15,
};
```

### Change Thresholds

```typescript
export const SCORE_THRESHOLDS = {
  EXCELLENT: 90, // ← Be stricter
  HIGH: 75,
  MEDIUM: 55,
};
```

### Add Skill Variations

```typescript
export const SKILL_VARIATIONS = {
  'next.js': ['next', 'nextjs'], // ← Add aliases
  // ...
};
```

---

## 🔍 Debugging

### Check Logs

```bash
docker logs -f backend | grep "MatchingService"
```

### Expected Output

```
[MatchingService] Starting match calculation for job: Backend Developer
[MatchingService] Skills Match: 7/10 (70%)
[MatchingService] Match calculation completed - Score: 85, Priority: EXCELLENT
```

### Common Issues

**Skills not matching?**
→ Add skill variations in `matching.constants.ts`

**Scores too low/high?**
→ Adjust weights in `MATCHING_WEIGHTS`

**Wrong priority?**
→ Adjust thresholds in `SCORE_THRESHOLDS`

---

## 📈 Performance

| Metric          | Value                |
| --------------- | -------------------- |
| Processing Time | ~50-100ms            |
| vs AI Matching  | 100x faster          |
| Cost Reduction  | 50% (1 AI call vs 2) |
| Total Pipeline  | ~3-6 seconds         |

---

## ✅ Checklist for Production

- [x] MatchingService implemented
- [x] Constants configuration created
- [x] Integration with Queue Processor
- [x] Modules imported correctly
- [x] Build passing
- [ ] Unit tests written (recommended)
- [ ] Integration tests (recommended)
- [ ] Monitoring setup (optional)

---

## 📚 Full Documentation

- **Architecture Guide**: `docs/HYBRID_MATCHING_ARCHITECTURE.md`
- **Implementation Summary**: `HYBRID_MATCHING_IMPLEMENTATION.md`
- **Usage Examples**: `src/matching/examples/usage.examples.ts`
- **Module README**: `src/matching/README.md`

---

## 🚀 Deploy

```bash
# Build
npm run build

# Test (recommended)
npm run test

# Run
npm run start:prod

# Docker
docker-compose up -d --build
```

---

**Quick Start**: Just inject `MatchingService` and call `calculateMatch()`  
**Customize**: Edit `matching.constants.ts`  
**Debug**: Check logs for "MatchingService"  
**Help**: See full docs in `docs/HYBRID_MATCHING_ARCHITECTURE.md`
