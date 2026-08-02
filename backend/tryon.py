import hashlib
import os
import uuid
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_IMAGE = BASE_DIR / "assets" / "mannequin.jpg"
DEFAULT_WEIGHTS_DIR = BASE_DIR / "fashn-vton-1.5" / "weights"
CACHE = {}
_PIPELINE = None

CATEGORY_MAP = {
    "top": "tops",
    "outerwear": "tops",
    "bottom": "bottoms",
    "dress": "one-pieces",
}


def _resolve(path: str) -> Path:
    candidate = Path(path) if path else DEFAULT_MODEL_IMAGE
    return candidate if candidate.is_absolute() else BASE_DIR / candidate


def _get_pipeline():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    try:
        from fashn_vton import TryOnPipeline
    except ImportError as error:
        raise RuntimeError(
            "FASHN VTON is not installed. Install backend/requirements-vton.txt first."
        ) from error

    weights_dir = Path(os.environ.get("FASHN_WEIGHTS_DIR", DEFAULT_WEIGHTS_DIR))
    if not (weights_dir / "model.safetensors").exists():
        raise RuntimeError(
            f"FASHN weights not found at {weights_dir}. Run the repository download_weights.py script."
        )
    _PIPELINE = TryOnPipeline(weights_dir=str(weights_dir))
    return _PIPELINE


def _prepare_garment(path: Path, category: str) -> Image.Image:
    """Crop model-photo inputs so unrelated garments and retail labels influence VTON less."""
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if category in ("top", "outerwear"):
        image = image.crop((int(width * 0.04), 0, int(width * 0.96), int(height * 0.72)))
    elif category == "bottom":
        image = image.crop((int(width * 0.04), int(height * 0.07), int(width * 0.96), height))
    return image


def run_tryon_outfit(garments: list[dict], model_image_path: str = "") -> str:
    if not garments:
        raise ValueError("At least one garment is required")
    person_path = _resolve(model_image_path)
    if not person_path.exists():
        raise FileNotFoundError(f"Person image not found: {person_path}")

    normalized = [garment for garment in garments if garment.get("category") in CATEGORY_MAP]
    normalized.sort(key=lambda garment: 0 if garment["category"] in ("top", "outerwear") else 1)
    cache_key = hashlib.md5(
        f"fashn-v1.5|{person_path}|{[(g.get('path'), g.get('category')) for g in normalized]}".encode()
    ).hexdigest()
    if cache_key in CACHE:
        return CACHE[cache_key]

    pipeline = _get_pipeline()
    person = Image.open(person_path).convert("RGB")
    for garment in normalized:
        garment_path = _resolve(garment["path"])
        if not garment_path.exists():
            raise FileNotFoundError(f"Garment image not found: {garment_path}")
        result = pipeline(
            person_image=person,
            garment_image=_prepare_garment(garment_path, garment["category"]),
            category=CATEGORY_MAP[garment["category"]],
            garment_photo_type="model",
            num_samples=1,
            num_timesteps=50,
            guidance_scale=1.5,
            seed=42,
            segmentation_free=True,
        )
        person = result.images[0]

    output_path = BASE_DIR / "uploads" / f"tryon_{uuid.uuid4()}.png"
    person.save(output_path)
    result_path = f"uploads/{output_path.name}"
    CACHE[cache_key] = result_path
    return result_path


def run_tryon(garment_image_path: str, model_image_path: str = "", category: str = "top") -> str:
    return run_tryon_outfit([{"path": garment_image_path, "category": category}], model_image_path)
