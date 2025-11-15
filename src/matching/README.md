# 🎯 Matching Module - Backend Scoring Engine

## Overview

Module chuyên trách tính toán matching score giữa CV và Job **không sử dụng AI**.

## Quick Start

```typescript
import { MatchingService } from './matching.service';

// Inject service
constructor(private matchingService: MatchingService) {}

// Calculate match
const result = await this.matchingService.calculateMatch(parsedCV, job);

console.log(result.matchingScore);  // 85
console.log(result.priority);       // ResumePriority.EXCELLENT
console.log(result.autoStatus);     // ResumeStatus.APPROVED
```

## File Structure

```
src/matching/
├── matching.module.ts           # Module definition
├── matching.service.ts          # Core scoring logic
├── constants/
│   └── matching.constants.ts    # All business rules (no hard-code)
└── dto/
    ├── match-result.dto.ts      # Result object
    └── skill-match.dto.ts       # Skill match details
```

## Core Features

### 1. Skills Matching (50% weight)

- Fuzzy matching với skill variations
- Proficiency level detection
- Support aliases (js → javascript, react → react.js)

### 2. Experience Scoring (30% weight)

- Dynamic scoring based on job level
- Handles over-qualified candidates
- Configurable thresholds per level

### 3. Education Scoring (20% weight)

- Degree level matching
- Job level appropriateness
- GPA consideration (future)

### 4. Auto Status Decision

- Auto approve: score ≥ 85 + skills ≥ 70%
- Auto reject: score < 30 + skills < 30%
- Default: REVIEWING

## Configuration

All business rules are in `constants/matching.constants.ts`:

```typescript
// Adjust weights
MATCHING_WEIGHTS = {
  SKILLS: 0.5, // Change to 0.6 to prioritize skills
  EXPERIENCE: 0.3,
  EDUCATION: 0.2,
};

// Adjust thresholds
SCORE_THRESHOLDS = {
  EXCELLENT: 85, // Change to 90 to be stricter
  HIGH: 70,
  MEDIUM: 50,
};
```

## Testing

```typescript
describe('MatchingService', () => {
  it('should match JavaScript variants', () => {
    const result = service.calculateSkillsMatch(['js', 'typescript'], ['javascript', 'typescript']);
    expect(result.matchedCount).toBe(2);
  });
});
```

## See Also

- [Full Architecture Docs](../../docs/HYBRID_MATCHING_ARCHITECTURE.md)
- [Constants Reference](./constants/matching.constants.ts)
- [DTO Schemas](./dto/)
