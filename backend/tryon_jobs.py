import hashlib
import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from tryon import run_tryon_outfit


_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="fashn-vton")
_lock = threading.Lock()
_jobs = {}
_active_by_request = {}


def _request_key(garments, model_path):
    payload = json.dumps({"garments": garments, "model_path": model_path}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def _serialize(job):
    now = time.time()
    started_at = job.get("started_at")
    finished_at = job.get("finished_at")
    elapsed = 0
    if started_at:
        elapsed = (finished_at or now) - started_at
    queued_jobs = [item for item in _jobs.values() if item["status"] == "queued"]
    queued_jobs.sort(key=lambda item: item["created_at"])
    queue_position = next(
        (index + 1 for index, item in enumerate(queued_jobs) if item["job_id"] == job["job_id"]),
        0,
    )
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress": job["progress"],
        "stage": job["stage"],
        "elapsed_seconds": round(elapsed, 1),
        "queue_position": queue_position,
        "result_path": job.get("result_path"),
        "error": job.get("error"),
        "deduplicated": job.get("deduplicated", False),
    }


def _update(job_id, **changes):
    with _lock:
        job = _jobs[job_id]
        job.update(changes)


def _run_job(job_id, request_key, garments, model_path):
    _update(
        job_id,
        status="running",
        progress=2,
        stage="Loading FASHN VTON",
        started_at=time.time(),
    )

    def report(progress, stage):
        _update(job_id, progress=max(2, min(99, int(progress))), stage=stage)

    try:
        result_path = run_tryon_outfit(garments, model_path, progress_callback=report)
        _update(
            job_id,
            status="complete",
            progress=100,
            stage="Try-on complete",
            result_path=result_path,
            finished_at=time.time(),
        )
    except Exception as error:
        print(f"[tryon-job:{job_id}] failed: {error}")
        _update(
            job_id,
            status="failed",
            stage="Try-on failed",
            error=str(error),
            finished_at=time.time(),
        )
    finally:
        with _lock:
            _active_by_request.pop(request_key, None)


def create_tryon_job(garments, model_path):
    request_key = _request_key(garments, model_path)
    with _lock:
        existing_id = _active_by_request.get(request_key)
        if existing_id and existing_id in _jobs:
            existing = _jobs[existing_id]
            existing["deduplicated"] = True
            return _serialize(existing)

        job_id = uuid.uuid4().hex
        job = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "stage": "Waiting for GPU",
            "created_at": time.time(),
            "started_at": None,
            "finished_at": None,
            "result_path": None,
            "error": None,
            "deduplicated": False,
        }
        _jobs[job_id] = job
        _active_by_request[request_key] = job_id
        if len(_jobs) > 100:
            completed = sorted(
                (item for item in _jobs.values() if item["status"] in ("complete", "failed")),
                key=lambda item: item["created_at"],
            )
            for old_job in completed[: len(_jobs) - 100]:
                _jobs.pop(old_job["job_id"], None)

    _executor.submit(_run_job, job_id, request_key, garments, model_path)
    return get_tryon_job(job_id)


def get_tryon_job(job_id):
    with _lock:
        job = _jobs.get(job_id)
        return _serialize(job) if job else None


def summarize_jobs():
    with _lock:
        completed = [_serialize(job) for job in _jobs.values() if job["status"] == "complete"]
        failed = [job for job in _jobs.values() if job["status"] == "failed"]
        running = [job for job in _jobs.values() if job["status"] in ("queued", "running")]
    durations = [job["elapsed_seconds"] for job in completed]
    return {
        "completed_jobs": len(completed),
        "failed_jobs": len(failed),
        "active_jobs": len(running),
        "average_seconds": round(sum(durations) / len(durations), 1) if durations else None,
        "fastest_seconds": min(durations) if durations else None,
        "slowest_seconds": max(durations) if durations else None,
    }
