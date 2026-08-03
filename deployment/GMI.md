# GMI Cloud deployment target

StyleAI's FastAPI/FASHN worker is designed to run as a single NVIDIA GPU service. This document defines the minimal migration path from the prototype environment to GMI Cloud; a deployment should only be identified as GMI-hosted after the validation evidence below has been captured.

## Intended workload

- API process: `python -m uvicorn app:app --host 0.0.0.0 --port 8000`
- Model: FASHN VTON v1.5
- GPU-sensitive operation: sequential top/bottom virtual try-on
- Persistent volume: `/weights` for model weights
- Required environment: see `gmi.env.example`

## Evidence required before claiming GMI usage

1. Create a real GMI GPU deployment or instance.
2. Record its deployment/instance ID in `GMI_DEPLOYMENT_ID`.
3. Set `INFERENCE_PLATFORM=gmi-cloud` only in that deployment.
4. Call `/tryon-provider` and retain the response.
5. Complete at least one `/tryon-jobs` request against the GMI-hosted URL.
6. Record `/tryon-metrics`, the GMI console deployment, GPU type, and elapsed time.
7. Configure the frontend's `VITE_API_URL` to the GMI-hosted backend.

Only after those checks should a demo describe GMI Cloud as the active inference platform.
