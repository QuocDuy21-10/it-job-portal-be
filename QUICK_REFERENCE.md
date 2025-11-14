# 🚀 Quick Reference - CV Parser & AI Matching

## 📋 TL;DR

Upload CV → Auto Parse → AI Analysis → Priority Score → Ready for Review

**Processing Time:** 30-60 seconds  
**Supported Formats:** PDF, DOC, DOCX, TXT  
**Max File Size:** 5MB  
**AI Model:** Gemini 2.0 Flash

---

## ⚡ Quick Commands

### Start Services

```bash
# Redis
redis-server

# Application
npm run dev
```

### Upload CV

```bash
curl -X POST http://localhost:8081/resumes/upload-cv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@cv.pdf" \
  -F "jobId=YOUR_JOB_ID"
```

### Check Results

```bash
curl -X GET http://localhost:8081/resumes/RESUME_ID/analysis \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Monitor Queue

```bash
# API
curl -X GET http://localhost:8081/resumes/queue/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Redis CLI
redis-cli KEYS "bull:resume-processing:*"
```

---

## 📊 Priority Levels

| Score  | Priority     | Action          |
| ------ | ------------ | --------------- |
| 85-100 | EXCELLENT 🌟 | Interview ASAP  |
| 70-84  | HIGH 🔥      | Priority Review |
| 50-69  | MEDIUM ⚡    | Consider        |
| 0-49   | LOW ❄️       | Likely Reject   |

---

## 🔍 Key Endpoints

```
POST   /resumes/upload-cv          - Upload & process CV
GET    /resumes/:id/analysis       - Get AI analysis
GET    /resumes/queue/stats        - Queue monitoring
POST   /resumes/:id/reparse        - Re-parse CV
POST   /resumes/:id/reanalyze      - Re-analyze CV
```

---

## 🐛 Troubleshooting

**Redis Error:**

```bash
redis-server  # Start Redis
```

**Gemini API Error:**

```bash
# Check .env
grep GEMINI_API_KEY .env
```

**File Not Found:**

```bash
# Check permissions
chmod 755 public/images/resumes/
```

**Queue Stuck:**

```bash
# Clear queue
redis-cli FLUSHDB
```

---

## 📁 File Structure

```
src/
├── gemini/              # AI service
├── cv-parser/           # File parsing
├── queues/              # Background jobs
│   ├── processors/      # Job handlers
│   └── services/        # Queue service
└── resumes/
    ├── resume-processing.service.ts  # Orchestrator
    └── resumes.controller.ts         # API endpoints

docs/
├── PHASE1_COMPLETE.md   # Phase 1 summary
├── PHASE2_COMPLETE.md   # Phase 2 summary
├── PHASE2_API_ENDPOINTS.md  # API docs
├── TESTING_GUIDE.md     # Testing guide
└── QUICK_START.md       # Setup guide
```

---

## ⚙️ Environment

```env
GEMINI_API_KEY=your_key
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_QUEUE_DB=0
REDIS_CACHE_DB=1
```

---

## 🎯 Success Metrics

- ✅ Upload time: < 1s
- ✅ Parse time: 15-30s
- ✅ Analysis time: 15-30s
- ✅ Total: 30-60s
- ✅ Cache hit: < 100ms
- ✅ Success rate: 95%+

---

## 📚 Documentation

- Full API docs: `docs/PHASE2_API_ENDPOINTS.md`
- Testing guide: `docs/TESTING_GUIDE.md`
- Setup guide: `docs/QUICK_START.md`

---

**Need Help?**

1. Check logs: `npm run dev`
2. Check Redis: `redis-cli MONITOR`
3. Check MongoDB: `db.resumes.find()`
4. Review docs in `docs/` folder

**All Systems Ready!** ✅
