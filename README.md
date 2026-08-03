# StyleAI virtual closet

StyleAI is a React fitting-room interface backed by FastAPI. It provides OpenAI outfit matching, AI garment tagging, online inspiration search, and local inference with [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5).

## Start the backend

### Install FASHN VTON on macOS

The model is intentionally kept in a Python 3.12 environment because its computer-vision dependencies are not reliably compatible with Python 3.13. The setup downloads roughly 2 GB of model weights:

```bash
cd backend
./setup_fashn_macos.sh
source .venv-vton/bin/activate
```

### Run the API

```bash
cd backend
source .venv-vton/bin/activate
export OPENAI_API_KEY="your-key"
export EXA_API_KEY="your-exa-key"
export FASHN_TIMESTEPS="20"
uvicorn app:app --reload --port 8000
```

Do not put secret keys in frontend variables beginning with `VITE_`: those values are embedded in browser JavaScript. The backend reads secrets from the environment.

## Start the frontend

In a second terminal:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend connects to `http://localhost:8000` by default. Set `VITE_API_URL` only when using a different backend address.

## Main API routes

- `GET /inventory` — load the user's closet
- `POST /recommendations` — generate outfits from active closet items
- `POST /online-inspiration` — search the web for outside outfit inspiration with Exa
- `POST /upload` — upload and AI-tag a garment
- `POST /tryon-jobs` — enqueue a complete top/bottom try-on and immediately return a job ID
- `GET /tryon-jobs/{job_id}` — poll queued/running/completed status without a long-lived request
- `POST /tryon-outfit` — synchronous compatibility endpoint for local use only
- `GET /tryon-provider` — report the active inference provider and quality settings
- `GET /tryon-metrics` — report completed/failed jobs and measured inference latency

## Try-on quality

The backend uses FASHN's `model` garment-photo mode, 20 diffusion steps in the demo configuration, deterministic seeding, category-specific inference, and sequential top-then-bottom application. It also crops retail screenshots to reduce interference from captions and unrelated clothing. For best results, upload a front-facing garment image with no watermark, accessories, hands, or other clothing visible.

## Repository review guide

For a fast technical review, these are the most important implementation paths:

- [`src/App.jsx`](src/App.jsx) — the complete user journey: authentication, closet management, AI recommendations, online inspiration, fitting-room job polling, restyle tutorials, donation flow, and profile controls.
- [`backend/stylist.py`](backend/stylist.py) — the OpenAI fashion-matching prompt and the validation that ensures a recommended outfit contains a compatible top and bottom (or a dress).
- [`backend/inspiration.py`](backend/inspiration.py) — OpenAI-personalised shopping direction combined with Exa product discovery and image-quality ranking.
- [`backend/tryon.py`](backend/tryon.py) — the FASHN VTON v1.5 inference adapter, sequential top/bottom try-on, image preparation, deterministic seed, and configurable diffusion-step count.
- [`backend/tryon_jobs.py`](backend/tryon_jobs.py) — the background inference queue, duplicate-request protection, progress state, elapsed-time measurement, and completed-job metrics.
- [`backend/circularity.py`](backend/circularity.py) — sourced restyling/tutorial discovery and OpenAI synthesis into practical step-by-step guides.
- [`backend/app.py`](backend/app.py) — the FastAPI contract connecting the frontend to authentication, inventory, search, circularity, try-on jobs, and metrics.
- [`deployment/GMI.md`](deployment/GMI.md) — the container-ready GMI Cloud deployment path and the evidence checklist for validating a future hosted GPU run.
- [`backend/data/closet.json`](backend/data/closet.json) — the demo user's local digital-closet dataset.

The strongest end-to-end evidence is visible by creating a try-on job, watching `GET /tryon-jobs/{job_id}` reach `completed`, viewing the generated image, and then checking `GET /tryon-metrics` for measured completion and latency data.

## Current constraints and external dependencies

- OpenAI-backed matching and synthesis require `OPENAI_API_KEY`; online product and tutorial discovery require `EXA_API_KEY`; model downloads may require `HF_TOKEN`.
- FASHN VTON inference requires its model weights and benefits substantially from an NVIDIA GPU. CPU execution is possible but is not suitable for a responsive demo.
- Login and wardrobe persistence are demo implementations backed by in-memory state and local JSON/files rather than a production identity provider and database.
- Online retailers may change page structure, image access, or availability, so external shopping results are best-effort and links should be rechecked before purchase.
- When an external AI/search service is unavailable, selected flows use clearly labelled local fallback data so the interface remains testable; those fallbacks are not evidence of a live provider response.
- Virtual try-on can struggle with occluded garments, watermarks, accessories, unusual poses, and images containing multiple clothing items. Clean, front-facing inputs produce the best results.

## Technology and partner sponsors

StyleAI was created at an event supported by [Agnes AI](https://llm.sg/), [GMI Cloud](https://www.gmicloud.ai/), [OpenAI](https://openai.com/), and [Zo Computer](https://zocomputer.jp/). Their work also shapes a practical roadmap for taking the prototype further:

- **OpenAI** powers outfit compatibility decisions, garment analysis, restyling-guide synthesis, product categorisation, and personalised shopping direction in the FastAPI backend.
- **GMI Cloud** is the intended hosted-GPU path for the FASHN try-on worker. We could not secure GMI Cloud credits during the build window; with access, we would deploy the existing container-ready inference service on a GMI GPU and report an evidence-based comparison of latency, throughput, reliability, and cost. The deployment contract and required proof are in [`deployment/GMI.md`](deployment/GMI.md).
- **Agnes AI** is a promising future layer for conversational wardrobe planning: users could refine recommendations, occasions, constraints, and restyling goals through a persistent stylist conversation.
- **Zo Computer** could extend StyleAI into an everyday personal-fashion workspace, coordinating saved inspiration, wardrobe planning, shopping research, and circularity actions in one place.
