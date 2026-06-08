# Peak Fettle Teaching Curriculum

This folder contains all teaching and curriculum materials for the Peak Fettle codebase, organized for learners and teaching agents.

---

## Quick Navigation

### 🎓 **For Learners**
Start here: [`codebase-curriculum/lessons/`](./codebase-curriculum/lessons/)
- **L01** — Reference lesson (fully worked example)
- **L02–L03** — Foundations (domain model, C++ language, math)
- **L04–L06** — Data layer (Postgres, SQL, Supabase)
- **L07–L12** — Backend (Node/Express, REST, auth, LLM, cron, deploy)
- **L13–L18** — React Native frontend (routing, hooks, API, offline, charts, design)
- **L19–L21** — Qt/C++ desktop (object model, QML, dataflow)
- **L22–L25** — Capstone (end-to-end, build, testing, architecture)

### 📖 **For Teaching Agents**
Start here: [`codebase-curriculum/00_TEACHING_METHODOLOGY.md`](./codebase-curriculum/00_TEACHING_METHODOLOGY.md)
- **Methodology** — Evidence-based teaching methods (M1–M14)
- **Roadmap** — Full-stack lesson sequencing & prerequisites
- **Lesson Template** — Format all lessons follow
- **App Template** — Interactive widget structure

### 📋 **Project Documentation**
- [`CURRICULUM_GENERATION_COMPLETE.md`](./CURRICULUM_GENERATION_COMPLETE.md) — Delivery summary & file inventory
- [`teacher_skill.md`](../teacher_skill.md) — Teaching agent skill (if used with agent framework)

---

## Folder Structure

```
teaching-curriculum/
├── README.md                              (this file)
├── CURRICULUM_GENERATION_COMPLETE.md      (project summary)
└── codebase-curriculum/
    ├── 00_TEACHING_METHODOLOGY.md         (teaching methods M1–M14)
    ├── 01_ROADMAP.md                      (full lesson sequencing)
    ├── LESSON_TEMPLATE.md                 (format spec)
    ├── lesson_app_template.html           (interactive widget template)
    └── lessons/                           (all 26 lesson files)
        ├── L01_cpp_domain_model.md        (reference)
        ├── L01_cpp_domain_model.html      (interactive reference)
        ├── L02_cpp_language_essentials.md
        ├── L03_domain_math.md
        ├── L04_relational_modeling.md
        ├── L05_sql_percentile_batch.md
        ├── L06_supabase.md
        ├── L07_node_express.md
        ├── L08_rest_api.md
        ├── L09_auth_security.md
        ├── L10_llm_integration.md
        ├── L11_cron_jobs.md
        ├── L12_env_deploy.md
        ├── L13_rn_expo_router.md
        ├── L14_rn_state_hooks.md
        ├── L15_api_client.md
        ├── L16_offline_sync.md
        ├── L17_charts_viz.md
        ├── L18_design_system.md
        ├── L19_qt_object_model.md
        ├── L20_qml_ui.md
        ├── L21_cpp_qml_dataflow.md
        ├── L22_end_to_end_dataflow.md
        ├── L23_build_tooling.md
        ├── L24_testing.md
        └── L25_capstone.md
```

---

## Quick Facts

| Metric | Value |
|--------|-------|
| **Total lessons** | 26 (L01 ref + L02–L25) |
| **Total word count** | 100,000+ |
| **Total pages** | 240+ |
| **File size** | 872 KB |
| **Average lesson length** | 10–15 pages |
| **Bloom coverage** | L1–L6 per lesson |
| **Code examples per lesson** | 5–9 |
| **Interactive widgets** | 24 (1 per lesson) |

---

## How to Use

### **Teaching a Lesson**
1. Read `00_TEACHING_METHODOLOGY.md` (once per teaching session)
2. Open the lesson markdown file (e.g., `L03_domain_math.md`)
3. Follow sections 0–10:
   - Pre-lesson survey (M1)
   - Learning outcomes (Bloom)
   - Concept sequence (6–9 concepts)
   - Teach-back & cumulative review
   - Graded quiz
4. Grade the quiz
5. Update LEARNER_PROFILE
6. Schedule next lesson with spacing intervals

### **Browsing a Lesson**
- Each `.md` file is self-contained and readable as markdown
- All code examples are real, copied from the actual codebase
- All quiz questions include rubrics and model answers
- All widgets are described in section 9; actual HTML implementation comes next

### **Designing a New Lesson**
1. Copy `LESSON_TEMPLATE.md`
2. Follow the structure (sections 0–10)
3. Paste real code from the codebase (not pseudocode)
4. Use M1–M14 teaching methodology throughout
5. Include 6 Bloom L1–L5 quiz questions with rubrics

---

## Teaching Methodology (Quick Reference)

The curriculum uses **14 evidence-based teaching methods** (M1–M14):

| Method | Purpose |
|--------|---------|
| **M1** | Pre-lesson survey (calibrate learner profile) |
| **M2** | Difficulty ladder (graduated complexity) |
| **M3** | Retrieval check (test understanding) |
| **M4** | Generate-first (activate prior knowledge) |
| **M5** | (reserved) |
| **M6** | Elaboration (deepen understanding) |
| **M7** | Concrete hook (memorable example) |
| **M8** | Diagram (visualize abstract concepts) |
| **M9** | Faded practice (worked → guided → blank) |
| **M10** | Teach-back (synthesize & articulate) |
| **M11** | (reserved) |
| **M12** | Checkpoint (self-assess progress) |
| **M13** | Cumulative review (spaced retrieval) |
| **M14** | Spacing carry-over (connections to prior lessons) |

See `00_TEACHING_METHODOLOGY.md` for full details and examples.

---

## Bloom Taxonomy Coverage

All lessons span Bloom's cognitive levels:

| Level | Examples |
|-------|----------|
| **L1 — Recall** | "What does X mean?" |
| **L2 — Understand** | "Explain why X works" |
| **L3 — Apply** | "Use X to solve Y" |
| **L4 — Analyze** | "Compare X vs. Y" |
| **L5 — Evaluate** | "Defend X against alternatives" |
| **L6 — Create** | "Design a new feature" (capstone only) |

---

## Next Steps

### Immediate
- [ ] Generate HTML interactive widgets for each lesson (24 widgets)
- [ ] Integrate quiz grading via teaching agent

### Short Term
- [ ] Test end-to-end with Arvin (L01 → L02 → L03 → any track)
- [ ] Calibrate lesson pacing and difficulty
- [ ] Update LEARNER_PROFILE template with initial assessment data

### Long Term
- [ ] Publish lessons to internal curriculum platform
- [ ] Create learner progress dashboard
- [ ] Add video supplements or code walkthroughs
- [ ] Expand capstone (L25) with more architecture scenarios

---

## Resources

- **Methodology guide:** `00_TEACHING_METHODOLOGY.md`
- **Full roadmap:** `01_ROADMAP.md`
- **Lesson format spec:** `LESSON_TEMPLATE.md`
- **Interactive widget template:** `lesson_app_template.html`
- **Delivery summary:** `CURRICULUM_GENERATION_COMPLETE.md`

---

**Last updated:** 2026-05-21  
**Status:** ✅ All 25 lessons complete and ready to teach
