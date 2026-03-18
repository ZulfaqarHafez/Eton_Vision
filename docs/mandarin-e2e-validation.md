# Mandarin E2E Validation (Qwen2-VL + SeaLion Encoder)

Date: 2026-03-18

## Goal

Validate full report generation flow in Mandarin:
1. Vision grounding by Qwen2-VL (Colab)
2. Template-aligned Mandarin encoding (SeaLion-preferred)
3. Correct SPARK labels and section structure in UI + published feed

## Pre-checks

1. Ensure `.env` has:
- `VITE_COLAB_URL=<active_tunnel_url>`
- `VITE_OPENROUTER_API_KEY=<key_for_mandarin_encoder>`

2. In app settings:
- Provider: `colab`
- Model: `qwen2-vl`
- Report Language: `ZH`
- Mandarin Encoder Model: `aisingapore/Llama-SEA-LION-v3-8B-R` (or your active SeaLion/OpenRouter model)

3. Ensure Colab backend exposes:
- `POST /infer` (image + context)
- Optional: `GET /health`

## Test Procedure

1. Start web app:
```bash
npm run dev
```

2. Upload one classroom photo with clear student actions.

3. Tag at least one student and provide activity context (EN or ZH).

4. Click generate and wait for completed report.

5. Confirm report structure is exactly:
- `情境:`
- `观察记录:`
- `学习分析:`

6. Confirm SPARK labels are only from this approved set:
- `语言与读写能力`
- `创意表达`
- `文化认知`
- `协作与社交能力`
- `认知发展`
- `精细动作与设计思维`

7. Confirm at least 2 domain lines are present under `学习分析`.

8. Publish report and verify in Feed:
- Mandarin section labels render correctly
- Category chips/colors render for Mandarin labels

## Quality Rubric (Pass/Fail)

1. Evidence fidelity: no details beyond visible behavior in image.
2. Child referencing: each domain sentence names the child explicitly.
3. Template fidelity: headings and labels exactly match approved Mandarin schema.
4. Tone: professional, warm, Singapore early childhood context.
5. Domain validity: no non-SPARK labels in learning analysis.

## Current Blocker Observed

From this workspace run (2026-03-18):
- Configured `VITE_COLAB_URL` responded `404` on probed endpoints (`/`, `/health`, `/infer`, `/docs`, `/openapi.json`).
- End-to-end runtime generation could not be executed until the tunnel/backend is active.
