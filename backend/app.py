from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from capture import tag_clothing
from inventory import delete_item, donate_item, load_closet, save_item, save_online_item
from tryon import inference_timesteps, run_tryon, run_tryon_outfit
from tryon_jobs import create_tryon_job, get_tryon_job, summarize_jobs
from stylist import generate_outfits
from inspiration import search_outfit_inspiration, search_shoppable_products
from circularity import generate_restyle_guides
from auth import login, user_for_token
from starlette.concurrency import run_in_threadpool
import uuid
import os
import ipaddress
import socket
from urllib.parse import urlparse
import httpx

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

class ItemActionRequest(BaseModel):
    item_id: int

class LoginRequest(BaseModel):
    email: str
    password: str

class ProductSearchRequest(BaseModel):
    query: str = ""
    surprise: bool = False
    vibe: list[str] = []

class OnlineItemRequest(BaseModel):
    title: str
    image: str
    url: str
    category: str = "top"
    color: str = "unknown"
    add_to_closet: bool = False

@app.post("/auth/login")
def auth_login(req: LoginRequest):
    result = login(req.email, req.password)
    if not result:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token, user = result
    return {"token": token, "user": user}

@app.get("/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    user = user_for_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired")
    return user

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

@app.post("/online-products")
async def online_products(req: ProductSearchRequest):
    items = [item for item in load_closet() if item.get("status") == "active"]
    try:
        results = await search_shoppable_products(req.query, items, req.vibe, req.surprise)
        return {"results": results, "mode": "surprise" if req.surprise else "search"}
    except Exception as error:
        print(f"[products] search failed: {error}")
        raise HTTPException(status_code=502, detail="Online product inspiration is unavailable") from error

def _safe_remote_image(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid product image URL")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if any(ipaddress.ip_address(address[4][0]).is_private or ipaddress.ip_address(address[4][0]).is_loopback for address in addresses):
            raise HTTPException(status_code=400, detail="Private image hosts are not allowed")
    except socket.gaierror as error:
        raise HTTPException(status_code=400, detail="Product image host could not be resolved") from error

@app.post("/import-online-item")
async def import_online_item(req: OnlineItemRequest):
    _safe_remote_image(req.image)
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.get(req.image)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/") or len(response.content) > 12_000_000:
            raise HTTPException(status_code=400, detail="Retailer image is unavailable or too large")
    extension = "png" if "png" in content_type else "jpg"
    filepath = f"uploads/online_{uuid.uuid4()}.{extension}"
    with open(filepath, "wb") as file:
        file.write(response.content)
    item = None
    if req.add_to_closet:
        item = save_online_item(req.title, req.category, req.color, req.url, filepath)
    return {"path": filepath, "item": item}

@app.post("/restyle-guides")
async def restyle_item(req: ItemActionRequest):
    items = [item for item in load_closet() if item.get("status") == "active"]
    item = next((piece for piece in items if piece.get("id") == req.item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Closet item not found")
    return {"item": item, "ideas": await generate_restyle_guides(item)}

@app.post("/donate-item")
async def donate_closet_item(req: ItemActionRequest):
    item = donate_item(req.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Closet item not found")
    return {"message": "Item removed from the active closet", "item": item}

@app.delete("/inventory/{item_id}")
def remove_closet_item(item_id: int):
    if not delete_item(item_id):
        raise HTTPException(status_code=404, detail="Closet item not found")
    return {"message": "Item deleted", "item_id": item_id}

@app.get("/model-images")
def model_images():
    candidates = []
    for filename in os.listdir("uploads"):
        lower = filename.lower()
        if lower.endswith((".png", ".jpg", ".jpeg", ".webp")) and ("model" in lower or "user" in lower):
            candidates.append({"name": filename, "path": f"uploads/{filename}", "url": f"/uploads/{filename}"})
    return {"images": candidates}

@app.post("/model-images")
async def upload_model_image(file: UploadFile = File(...)):
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in {"png", "jpg", "jpeg", "webp"}:
        raise HTTPException(status_code=400, detail="Upload a PNG, JPG or WEBP image")
    filename = f"user-model-{uuid.uuid4()}.{ext}"
    filepath = f"uploads/{filename}"
    with open(filepath, "wb") as f:
        f.write(await file.read())
    return {"name": filename, "path": filepath, "url": f"/uploads/{filename}"}

@app.delete("/model-images/{filename}")
def delete_model_image(filename: str):
    safe_name = os.path.basename(filename)
    if safe_name != filename or not ("model" in safe_name.lower() or "user" in safe_name.lower()):
        raise HTTPException(status_code=400, detail="Invalid profile image")
    candidates = [name for name in os.listdir("uploads") if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and ("model" in name.lower() or "user" in name.lower())]
    if len(candidates) <= 1:
        raise HTTPException(status_code=400, detail="Keep at least one fitting-room photo")
    filepath = os.path.join("uploads", safe_name)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Profile image not found")
    os.remove(filepath)
    return {"message": "Profile image deleted", "name": safe_name}

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
    infrastructure = os.environ.get("INFERENCE_PLATFORM", "local-or-kaggle")
    deployment_id = os.environ.get("GMI_DEPLOYMENT_ID")
    return {
        "provider": "fashn-AI/fashn-vton-1.5",
        "mode": "local",
        "infrastructure": infrastructure,
        "deployment_id": deployment_id,
        "gmi_deployment_declared": infrastructure == "gmi-cloud" and bool(deployment_id),
        "quality_steps": inference_timesteps(),
        "job_queue": True,
    }

@app.get("/tryon-metrics")
def tryon_metrics():
    return {
        **summarize_jobs(),
        "infrastructure": os.environ.get("INFERENCE_PLATFORM", "local-or-kaggle"),
        "quality_steps": inference_timesteps(),
    }

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
