from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from capture import tag_clothing
from inventory import load_closet, save_item
from tryon import inference_timesteps, run_tryon, run_tryon_outfit
from tryon_jobs import create_tryon_job, get_tryon_job
from stylist import generate_outfits
from inspiration import search_outfit_inspiration
from starlette.concurrency import run_in_threadpool
import uuid
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/")
def home():
    return {"message": "Virtual Closet API is running!"}

@app.get("/inventory")
def get_inventory():
    return load_closet()

@app.post("/upload")
async def upload_clothing(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = f"uploads/{filename}"
    with open(filepath, "wb") as f:
        f.write(await file.read())
    tags = await tag_clothing(filepath)
    item = save_item(tags, filepath)
    return {"message": "Item added!", "item": item}

@app.post("/tryon")
async def virtual_tryon(
    garment: UploadFile = File(...),
    model: UploadFile = File(None)
):
    garment_ext = garment.filename.split(".")[-1]
    garment_filename = f"garment_{uuid.uuid4()}.{garment_ext}"
    garment_path = f"uploads/{garment_filename}"
    with open(garment_path, "wb") as f:
        f.write(await garment.read())

    model_path = ""
    if model:
        model_ext = model.filename.split(".")[-1]
        model_filename = f"model_{uuid.uuid4()}.{model_ext}"
        model_path = f"uploads/{model_filename}"
        with open(model_path, "wb") as f:
            f.write(await model.read())

    result_path = await run_in_threadpool(run_tryon, garment_path, model_path)
    return {"message": "Try-on complete!", "result_url": f"http://localhost:8000/{result_path}"}

class TryOnRequest(BaseModel):
    garment_path: str
    model_path: str = ""

class GarmentReference(BaseModel):
    path: str
    category: str

class OutfitTryOnRequest(BaseModel):
    garments: list[GarmentReference]
    model_path: str = ""

class RecommendationRequest(BaseModel):
    occasion: str = "casual"
    season: str = "summer"

class InspirationRequest(BaseModel):
    query: str = "fresh outfits"
    occasion: str = "casual"

@app.post("/recommendations")
async def recommendations(req: RecommendationRequest):
    items = [item for item in load_closet() if item.get("status") == "active"]
    return await generate_outfits(items, req.occasion, req.season)

@app.post("/online-inspiration")
async def online_inspiration(req: InspirationRequest):
    try:
        return {"results": await search_outfit_inspiration(req.query, req.occasion)}
    except Exception as error:
        print(f"[exa] search failed: {error}")
        raise HTTPException(status_code=502, detail="Online inspiration search is unavailable") from error

@app.post("/tryon-by-path")
async def tryon_by_path(req: TryOnRequest):
    try:
        result_path = await run_in_threadpool(run_tryon, req.garment_path, req.model_path)
        return {"message": "Try-on complete!", "result_url": f"http://localhost:8000/{result_path}"}
    except Exception as error:
        print(f"[tryon] generation failed: {error}")
        raise HTTPException(status_code=502, detail="Virtual try-on provider is unavailable") from error

@app.post("/tryon-outfit")
async def tryon_outfit(req: OutfitTryOnRequest):
    try:
        garments = [garment.model_dump() for garment in req.garments]
        result_path = await run_in_threadpool(run_tryon_outfit, garments, req.model_path)
        return {
            "message": "Complete outfit try-on generated with FASHN VTON v1.5",
            "provider": "fashn-AI/fashn-vton-1.5",
            "result_url": f"http://localhost:8000/{result_path}",
        }
    except Exception as error:
        print(f"[fashn-vton] generation failed: {error}")
        raise HTTPException(status_code=502, detail=str(error)) from error

@app.post("/tryon-jobs", status_code=202)
def submit_tryon_job(req: OutfitTryOnRequest):
    garments = [garment.model_dump() for garment in req.garments]
    return create_tryon_job(garments, req.model_path)

@app.get("/tryon-jobs/{job_id}")
def tryon_job_status(job_id: str):
    job = get_tryon_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Try-on job not found")
    return job

@app.get("/tryon-provider")
def tryon_provider():
    return {
        "provider": "fashn-AI/fashn-vton-1.5",
        "mode": "local",
        "quality_steps": inference_timesteps(),
        "job_queue": True,
    }

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
