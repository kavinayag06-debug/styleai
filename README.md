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
- `POST /tryon-outfit` — sequentially try on a complete top/bottom outfit with FASHN VTON v1.5
- `GET /tryon-provider` — report the active inference provider and quality settings

## Try-on quality

The backend uses FASHN's `model` garment-photo mode, 50 diffusion steps, deterministic seeding, category-specific inference, and sequential top-then-bottom application. It also crops retail screenshots to reduce interference from captions and unrelated clothing. For best results, upload a front-facing garment image with no watermark, accessories, hands, or other clothing visible.
