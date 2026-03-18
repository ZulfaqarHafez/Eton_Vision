# Eton Vision

Eton Vision is a React + TypeScript web application for early childhood observation workflows.
It combines face recognition, student tagging, and AI-assisted report writing with bilingual report support.

This document describes what is implemented in the current codebase.

## 1) Implementation Status (Current)

### Reports workspace

- Single and batch photo upload are implemented.
- Batch review supports teacher-friendly modes:
	- Main Focus: primary photo used for report generation.
	- Context Photos: supporting photos for quick review.
- Face detection and face matching are implemented for uploaded photos.
- Unknown face reassignment is implemented:
	- Teacher can click an unassigned face box and assign a student.
	- Assignment is persisted to face signatures with angle label AUTO_VERIFIED.
- Students can be included/excluded per selected photo for report generation.
- Manual student add without a detected face box is implemented.
- Activity context supports quick templates and local draft persistence.
- Optional continuity assist is implemented by fetching recent published reports for the selected child.
- Output language selection is implemented in the report workflow (EN or ZH).
- Provider selection is preserved across language changes.
- Generation reliability guard is implemented:
	- First empty output triggers one automatic retry.
- Refinement flow is implemented:
	- User can submit follow-up prompts to revise the current report.

### Report formatting and parsing

- Structured report parser is implemented for both EN and ZH report formats.
- Supported sections:
	- CONTEXT / OBSERVATION / LEARNING ANALYSIS (EN)
	- Mandarin section equivalents (ZH)
- Learning analysis supports 6 SPARK domains:
	- Language and Literacy
	- Creative Expression
	- Cultural Awareness
	- Collaboration and Social Skills
	- Cognitive Development
	- Fine Motor and Design Thinking
- Report generation output is normalized to the strict template before streaming to UI.
- Report refinement output is normalized to the strict template before streaming to UI.

### Students workspace

- Student list with signature counts is implemented.
- Upload-based enrolment is implemented.
- Live scan enrolment is implemented with multi-angle capture flow:
	- FRONT, LEFT, RIGHT, TOP_DOWN, DEEP_PROFILE, BACK
- Coverage tracking and capture guidance are implemented in live scan.
- Only captures with a descriptor are persisted as face signatures.

### Feed workspace

- Publishing report to Supabase is implemented.
- Published reports feed is implemented with expandable cards.
- Report delete is implemented.
- Feed rendering supports EN and ZH report label variants.

### AI provider layer

- Provider abstraction is implemented in a unified service layer.
- Supported providers:
	- Colab tunnel
	- OpenAI
	- Hugging Face
	- Ollama
	- OpenRouter
- Streaming support is implemented for OpenAI-compatible SSE and Ollama NDJSON.
- Colab proxy integration is implemented through Vite dev server proxy.

### Performance work implemented

- Route-level lazy loading is implemented for main pages.
- Feature-level lazy loading is implemented for heavier components.
- Vite manual chunk splitting is configured for framework, UI, data, and vision libraries.
- Chunk warning threshold is tuned for ML-heavy build output.

## 2) Architecture

### Frontend application

- Framework: React 18 + TypeScript + Vite.
- Routing:
	- / -> main workspace (reports + students tabs)
	- /feed -> published reports view
- UI stack: Tailwind CSS + Radix primitives + custom components.

### AI/report service layer

- File: src/backend/services/vlm.ts
- Responsibilities:
	- Provider config and persistence
	- Prompt construction
	- Provider request orchestration
	- Streaming abstraction
	- EN/ZH report normalization to canonical template
	- Refine flow orchestration

### Data layer (Supabase)

- File: src/frontend/lib/supabase.ts
- Responsibilities:
	- Client initialization
	- Face matching RPC calls
	- Published report CRUD operations
	- Report image storage uploads
	- Recent report retrieval for continuity assist

### Architecture Diagram (Compact)

```text
Browser (React + Vite)
|
|-- Route: / (Index)
|   |-- Image pipeline: ImageUpload -> PhotoReview -> FaceTagPanel
|   |-- Report UI: ReportPanel -> ObservationReport
|   |-- Config UI: SettingsPanel
|   `-- AI Orchestration: backend/services/vlm.ts
|       |-- Provider adapters: Colab | OpenAI | OpenRouter | Ollama | Hugging Face
|       |-- Streaming handlers: SSE / NDJSON / simulated stream
|       `-- Template normalization: EN/ZH strict section output
|
`-- Route: /feed (Feed)
    `-- Published report browsing and delete actions

Data plane (Supabase)
|-- tables: children, face_signatures, published_reports
|-- storage: report-images
`-- RPC: match_child_multi (embedding similarity)

Dev network edge
`-- Vite proxy: /api/colab -> VITE_COLAB_URL
```

## 3) End-to-End Flow

### Report generation flow

1. Teacher uploads photos and selects tagged students.
2. Teacher provides activity context.
3. App builds provider prompt using selected language and context.
4. Provider response is streamed.
5. Raw output is normalized into strict report template.
6. UI parses and renders structured sections.

### Report refinement flow

1. Teacher provides follow-up refinement instruction.
2. Current report + follow-up prompt are sent through refinement pipeline.
3. Refined output is normalized into strict template.
4. UI displays revised report while preserving expected section structure.

### Face recognition flow

1. face-api models are loaded from public/models.
2. Faces are detected and descriptors are extracted.
3. Each descriptor is matched via Supabase RPC.
4. Tags are shown to teacher for inclusion/exclusion.
5. Manual reassignment can persist additional signatures for retraining.

## 4) Environment Configuration

Create .env from .env.example and configure values.

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| VITE_SUPABASE_URL | Yes | Supabase client | Required for all data operations |
| VITE_SUPABASE_ANON_KEY | Yes | Supabase client | Required for all data operations |
| VITE_COLAB_URL | Required for Colab | Vite proxy + provider defaults | Used by /api/colab proxy target |
| VITE_OPENAI_API_KEY | Optional | OpenAI provider | Used as default OpenAI key |
| VITE_OPENROUTER_API_KEY | Optional | OpenRouter provider | Needed when OpenRouter is selected; recommended for Mandarin encoder fallback paths |
| VITE_MANDARIN_ENCODER_MODEL | Optional | VLM service | Overrides default Mandarin encoder model id |

Notes:

- Hugging Face key can be entered in Settings panel (not auto-loaded from env in provider defaults).
- Provider settings are persisted in browser localStorage.

## 5) Supabase Requirements

The application expects these backend resources:

- Table children
	- id, name, class_group, consent_given, created_at
- Table face_signatures
	- id, child_id, embedding, image_url, angle_label, created_at
- RPC function match_child_multi
	- Input: query_embedding, match_threshold
	- Output: child_id, name, similarity
- Table published_reports
	- Includes title, student_name, class_group, image_url, context, observation, learning_analysis, report_raw, created_at
- Storage bucket report-images
	- Public read URL path for published report images

## 6) Local Development

### Prerequisites

- Node.js 18+
- npm

### Install and run

```sh
npm install
npm run dev
```

Default dev URL: http://localhost:8080

## 7) Scripts

```sh
npm run dev          # Start dev server
npm run lint         # Lint source
npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode
npm run build        # Production build
npm run preview      # Preview production build
```

## 8) Testing Coverage (Current)

Current unit tests cover:

- Prompt template heading expectations
- Report parser behavior for EN and ZH structures
- Basic test harness sanity checks

## 9) Key Project Paths

```text
src/
	App.tsx
	backend/services/vlm.ts
	frontend/
		components/
			FaceTagPanel.tsx
			PhotoReview.tsx
			LiveScanEnrolment.tsx
			StudentEnrolment.tsx
			StudentList.tsx
			ReportPanel.tsx
			ObservationReport.tsx
			SettingsPanel.tsx
		hooks/
			useFaceDetection.ts
		lib/
			parseReport.ts
			faceUtils.ts
			supabase.ts
		pages/
			Index.tsx
			Feed.tsx
			NotFound.tsx
	test/
		parseReport.test.ts
		vlmPrompt.test.ts
public/
	models/
```

## 10) Operational Notes

- Colab requests in dev mode are routed via /api/colab proxy in Vite config.
- Browser shows a browserslist age warning during build; this is informational and does not block build output.
- API keys set in Settings are stored client-side; use environment and deployment controls appropriately for production.
