# Face Model Upgrade Evaluation (Occlusion + Partial Face)

Date: 2026-03-15

## Current baseline in this project

The current browser stack uses face-api.js models loaded from `public/models`:
- `ssd_mobilenetv1` for detection
- `face_landmark_68` for landmarks
- `face_recognition` for embeddings

This is simple to run in-browser, but it is not the strongest option for heavy occlusion, masks, deep profile, and large-scale identity discrimination.

## InsightFace vs ArcFace

## ArcFace

ArcFace is primarily a recognition loss/embedding method (additive angular margin), not a full end-to-end product stack by itself.

Strengths:
- Very strong discriminative embeddings in face recognition benchmarks.
- Sub-center ArcFace variants improve robustness to noisy/hard samples.
- Good foundation for masked/partial-face training when combined with the right data and detector.

Gaps:
- ArcFace alone does not solve detection/alignment/runtime pipeline.
- You still need detector, alignment, model serving, and packaging choices.

## InsightFace

InsightFace is a full toolkit that includes ArcFace-family recognition plus production-oriented detection/alignment options (for example SCRFD + recognition backbones in model packs).

Strengths:
- Broader end-to-end stack for detection + alignment + recognition.
- Better practical upgrade path for occlusion/profile cases than swapping only one model.
- Strong ecosystem around ArcFace, Sub-center ArcFace, and Partial FC training workflows.

Gaps / risks:
- Moving from browser-only inference to backend/ONNX runtime architecture is a larger integration step.
- Pretrained model licensing must be reviewed carefully for production/commercial usage.

## Occlusion and partial-face relevance

Signals from public InsightFace resources indicate mature support around masked/partial scenarios:
- ICCV21 Masked Face Recognition challenge materials and baseline reporting.
- Sub-center ArcFace motivation explicitly targets robustness under noisy/hard data.
- Partial FC work focuses efficient and robust large-scale training.

For this project, that means: if occlusion and non-frontal views are a priority, InsightFace (with ArcFace-family recognition) is usually a stronger upgrade path than replacing only the current embedding model.

## Recommendation for Eton Vision

Preferred direction:
1. Keep current browser UI capture flow.
2. Add a backend recognition service using InsightFace pipeline (SCRFD detector + ArcFace-family recognizer).
3. Use current Supabase `face_signatures` records to bootstrap evaluation, then retrain/tune with your classroom-specific data.
4. Keep front-end as capture/review UX; move identity scoring to backend service for better model flexibility.

Why this is safer:
- You can A/B test without breaking the current teacher workflow.
- You get stronger detectors/embeddings for profile, mask, and partial visibility.
- You avoid over-committing to a browser-only model stack for difficult real-world conditions.

## Minimum proof-of-concept plan

1. Build a small evaluation set from your own enrolment photos (front, side, deep profile, top-down, occluded/mask).
2. Run current face-api pipeline vs InsightFace pipeline and compare TAR/FAR and false-match behavior.
3. Introduce quality gates (face size, blur, occlusion) before writing embeddings.
4. Roll out backend matching behind a feature flag and monitor teacher correction rate.

## References checked

- InsightFace repository and docs (ArcFace-family, SCRFD, challenge materials)
- ArcFace paper: arXiv:1801.07698
- Partial FC paper: arXiv:2203.15565
- InsightFace ICCV21 masked-face challenge materials
