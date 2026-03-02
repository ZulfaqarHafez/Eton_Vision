# Eton Vision

AI-powered observation reports for early childhood educators. Upload classroom photos, automatically identify enrolled students via face recognition, and generate developmental assessment reports aligned to the Singapore Early Childhood Framework.

## Features

- **Student Enrolment** — Register students with a photo. Face embeddings are extracted and stored for future recognition.
- **Face Recognition** — Upload a classroom photo and faces are automatically detected and matched to enrolled students.
- **Report Generation** — Tagged students are fed into a Vision Language Model that produces structured observation reports with context, narrative observations, and learning goals across five developmental domains.
- **Multiple VLM Providers** — Supports Colab (Qwen2-VL), HuggingFace, Ollama, and OpenRouter (Gemini, Claude, GPT-4o Mini, etc.)

## Getting Started

Requires Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Install dependencies
npm install

# Copy environment config and fill in your keys
cp .env.example .env

# Start the development server
npm run dev
```

The app runs at `http://localhost:8080`.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_COLAB_URL` | Yes (if using Colab) | Your Colab ngrok/tunnel URL for the GPU model |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `VITE_HUGGINGFACE_API_KEY` | Optional | HuggingFace API key |
| `VITE_OPENROUTER_API_KEY` | Optional | OpenRouter API key |

## Tech Stack

- **Frontend** — React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion
- **Face Recognition** — face-api.js (SSD MobileNet v1, 68-point landmarks, 128-dim face descriptors)
- **Backend** — Supabase (PostgreSQL + pgvector for face embedding similarity search)
- **AI Reports** — Vision Language Models via configurable providers

## Project Structure

```
src/
├── backend/services/
│   └── vlm.ts                    # VLM provider integrations
├── frontend/
│   ├── components/
│   │   ├── FaceTagPanel.tsx       # Auto face detection + tagging on uploaded images
│   │   ├── StudentEnrolment.tsx   # Student registration form with face capture
│   │   ├── StudentList.tsx        # Enrolled students list + face data management
│   │   ├── Header.tsx             # App header
│   │   ├── ImageUpload.tsx        # Drag-and-drop image upload
│   │   ├── ReportPanel.tsx        # Report display container
│   │   ├── ObservationReport.tsx  # Formatted report with learning domains
│   │   ├── SettingsPanel.tsx      # VLM provider configuration
│   │   └── ui/                    # shadcn/ui components
│   ├── hooks/
│   │   └── useFaceDetection.ts    # face-api.js model loading + detection
│   ├── lib/
│   │   ├── supabase.ts            # Supabase client + face matching RPC
│   │   ├── faceUtils.ts           # Face thumbnail extraction
│   │   ├── parseReport.ts         # Report text parser
│   │   └── utils.ts               # Tailwind cn() helper
│   └── pages/
│       └── Index.tsx              # Main page (Reports + Students tabs)
public/
└── models/                        # face-api.js pre-trained model weights (~12MB)
```
