"""Durable PostgreSQL queue with leases, isolated tasks, retention and race checks."""
import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
import boto3
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from validation import MAX_BYTES, validate_glb

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
ROOT = Path(__file__).parent
BUCKET = os.environ["BODY_S3_BUCKET"]
s3 = boto3.client("s3", region_name=os.getenv("BODY_S3_REGION", "ca-central-1"), endpoint_url=os.getenv("BODY_S3_ENDPOINT") or None)
stopping = False


def stop(*_):
    global stopping
    stopping = True


def connect():
    return psycopg.connect(os.environ["BODY_DATABASE_URL"], row_factory=dict_row)


def enqueue(db, scan_id, kind, delay=0):
    db.execute("INSERT INTO body_jobs(id,scan_id,kind,available_at) VALUES(%s,%s,%s,now()+%s*interval '1 second')", (uuid.uuid4(), scan_id, kind, delay))


def delete_prefix(prefix):
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
        if objects:
            result = s3.delete_objects(Bucket=BUCKET, Delete={"Objects": objects})
            if result.get("Errors"):
                raise RuntimeError("Object deletion must be retried")


def sweep():
    with connect() as db:
        expired = db.execute("SELECT id FROM body_scans WHERE state<>'deleted' AND accessed_at<now()-interval '30 days' FOR UPDATE SKIP LOCKED").fetchall()
        for row in expired:
            db.execute("UPDATE body_scans SET state='deleted',version=version+1,metadata='{}',measurements='{}',corrections='{}',landmarks=NULL,quality='{}',display_key=NULL,collision_key=NULL,share_fit=false,error=NULL WHERE id=%s", (row["id"],))
            db.execute("UPDATE body_tryons SET state='cancelled',result_key=NULL WHERE scan_id=%s", (row["id"],))
            db.execute("UPDATE body_jobs SET state='cancelled' WHERE scan_id=%s AND kind<>'purge' AND state IN ('queued','running')", (row["id"],))
            enqueue(db, row["id"], "purge")
        for row in db.execute("SELECT id,raw_key,state FROM body_scans WHERE raw_expires_at<=now() AND raw_deleted=false FOR UPDATE SKIP LOCKED").fetchall():
            s3.delete_object(Bucket=BUCKET, Key=row["raw_key"])
            db.execute("UPDATE body_scans SET raw_deleted=true,state=CASE WHEN state IN ('uploading','processing') AND display_key IS NULL THEN 'failed' ELSE state END,error=CASE WHEN state IN ('uploading','processing') AND display_key IS NULL THEN 'Raw capture expired; please rescan.' ELSE error END WHERE id=%s", (row["id"],))
        db.execute("DELETE FROM body_pairings WHERE expires_at<now()")
        db.execute("DELETE FROM body_rate_limits WHERE resets_at<now()-interval '1 day'")


def claim():
    with connect() as db:
        # Leases are longer than the isolated task timeout. A dead worker can be
        # retried, but its lease token can never publish over the replacement.
        row = db.execute("""SELECT * FROM body_jobs WHERE
          (state='queued' AND available_at<=now()) OR (state='running' AND leased_until<now())
          ORDER BY CASE WHEN kind='purge' THEN 0 ELSE 1 END, available_at
          FOR UPDATE SKIP LOCKED LIMIT 1""").fetchone()
        if not row:
            return None
        token = uuid.uuid4()
        db.execute("UPDATE body_jobs SET state='running',attempts=attempts+1,lease_token=%s,leased_until=now()+interval '25 minutes' WHERE id=%s", (token, row["id"]))
        row["lease_token"], row["attempts"] = token, row["attempts"] + 1
        return row


def download(key, path, limit=MAX_BYTES):
    info = s3.head_object(Bucket=BUCKET, Key=key)
    if not 0 < info["ContentLength"] <= limit:
        raise ValueError("Asset exceeds processing limits")
    s3.download_file(BUCKET, key, str(path))


def publish_file(path, key):
    validate_glb(path.read_bytes())
    # Production bucket encryption is configured at setup. Local MinIO has no
    # KMS by default; requesting SSE-S3 there would make every publication fail.
    extra = {"ContentType": "model/gltf-binary"}
    if not os.getenv("BODY_S3_ENDPOINT"):
        extra["ServerSideEncryption"] = "AES256"
    s3.upload_file(str(path), BUCKET, key, ExtraArgs=extra)


def process(job):
    scan_id = str(job["scan_id"])
    if job["kind"] == "purge":
        delete_prefix(f"body/{scan_id}/")
        with connect() as db:
            db.execute("UPDATE body_scans SET raw_deleted=true WHERE id=%s", (scan_id,))
            db.execute("UPDATE body_jobs SET state='done' WHERE id=%s AND lease_token=%s", (job["id"], job["lease_token"]))
        return
    with connect() as db:
        scan = db.execute("SELECT * FROM body_scans WHERE id=%s AND state NOT IN ('deleted','rejected')", (scan_id,)).fetchone()
        if not scan:
            db.execute("UPDATE body_jobs SET state='cancelled' WHERE id=%s AND lease_token=%s", (job["id"], job["lease_token"]))
            return
        attempt_version = scan["version"]
        tryon = None
        if job["kind"] == "simulate":
            tryon = db.execute("SELECT * FROM body_tryons WHERE id=%s AND state IN ('queued','processing') AND body_version=%s", (job["tryon_id"], attempt_version)).fetchone()
            if not tryon:
                db.execute("UPDATE body_jobs SET state='cancelled' WHERE id=%s", (job["id"],))
                return
            db.execute("UPDATE body_tryons SET state='processing',progress=10 WHERE id=%s", (tryon["id"],))
    with tempfile.TemporaryDirectory(prefix="form-body-") as temp:
        root = Path(temp)
        request = {"kind": job["kind"], "metadata": scan["metadata"], "landmarks": scan["landmarks"]}
        if job["kind"] == "reconstruct":
            path = root / ("input.zip" if scan["metadata"]["format"] == "rgbd" else "input." + scan["metadata"]["format"])
            download(scan["raw_key"], path)
        elif job["kind"] == "measure":
            path = root / "display.glb"
            download(scan["display_key"], path)
        else:
            path = root / "display.glb"
            download(scan["display_key"], path)
            download(scan["collision_key"], root / "collision.glb")
            request.update({"display": str(path), "collision": str(root / "collision.glb"), "garments": []})
            with connect() as db:
                for index, selection in enumerate(tryon["garments"]):
                    row = db.execute("SELECT data FROM body_garments WHERE id=%s AND version=%s AND enabled=true", (selection["garmentId"], selection["version"])).fetchone()
                    if not row:
                        raise ValueError("Garment evidence changed; request a new try-on")
                    garment = row["data"]
                    size = next(s for s in garment["sizes"] if s["label"] == selection["size"])
                    asset = root / f"garment-{index}.blend"
                    download(size["blendKey"], asset)
                    request["garments"].append({"path": str(asset), "productId": garment["productId"], "category": garment["category"]})
        request["input"] = str(path)
        request_path = root / "request.json"
        request_path.write_text(json.dumps(request))
        command = [os.getenv("BLENDER_BIN", "blender"), "--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", str(ROOT / "simulate.py"), "--", str(request_path)] if tryon else [sys.executable, str(ROOT / "pipeline.py"), str(request_path)]
        # Task logs may contain file paths/scan data. Never forward them to
        # application logs or API responses. Return controlled errors only.
        completed = subprocess.run(command, timeout=1200, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if completed.returncode:
            raise ValueError("Processing could not validate this asset. Review capture quality or garment arrangement.")
        with connect() as db:
            current = db.execute("SELECT * FROM body_scans WHERE id=%s FOR UPDATE", (scan_id,)).fetchone()
            lease = db.execute("SELECT state,lease_token FROM body_jobs WHERE id=%s FOR UPDATE", (job["id"],)).fetchone()
            if current["state"] in ("deleted", "rejected") or current["version"] != attempt_version or lease["state"] != "running" or lease["lease_token"] != job["lease_token"]:
                return
            prefix = f"body/{scan_id}/derived/v{attempt_version}/{job['lease_token']}"
            if job["kind"] == "reconstruct":
                display, collision = prefix + "/display.glb", prefix + "/collision.glb"
                publish_file(root / "display.glb", display)
                publish_file(root / "collision.glb", collision)
                quality = json.loads((root / "result.json").read_text())["quality"]
                db.execute("UPDATE body_scans SET state='review',display_key=%s,collision_key=%s,quality=%s,raw_deleted=true,error=NULL WHERE id=%s", (display, collision, Jsonb(quality), scan_id))
                s3.delete_object(Bucket=BUCKET, Key=scan["raw_key"])
            elif job["kind"] == "measure":
                values = json.loads((root / "result.json").read_text())["measurements"]
                db.execute("UPDATE body_scans SET state='ready',measurements=%s,error=NULL WHERE id=%s", (Jsonb(values), scan_id))
            else:
                # Lock/version check serializes publication against corrections
                # and deletion. No stale job can become visible again.
                current_tryon = db.execute("SELECT state FROM body_tryons WHERE id=%s FOR UPDATE", (tryon["id"],)).fetchone()
                if current_tryon["state"] != "processing":
                    return
                key = prefix + f"/tryon-{tryon['id']}.glb"
                publish_file(root / "result.glb", key)
                db.execute("UPDATE body_tryons SET state='ready',progress=100,result_key=%s,error=NULL WHERE id=%s", (key, tryon["id"]))
            db.execute("UPDATE body_jobs SET state='done' WHERE id=%s AND lease_token=%s", (job["id"], job["lease_token"]))


def fail(job, error):
    # Validation errors are terminal; transient storage/DB errors get three
    # attempts. Purges retry indefinitely because deletion must eventually finish.
    retry = job["kind"] == "purge" or (not isinstance(error, (ValueError, subprocess.TimeoutExpired)) and job["attempts"] < 3)
    message = "Processing timed out; try a smaller capture." if isinstance(error, subprocess.TimeoutExpired) else "Processing failed. Check capture quality and service configuration."
    with connect() as db:
        db.execute("SELECT id FROM body_scans WHERE id=%s FOR UPDATE", (job["scan_id"],))
        lease = db.execute("SELECT state,lease_token FROM body_jobs WHERE id=%s FOR UPDATE", (job["id"],)).fetchone()
        if lease["state"] != "running" or lease["lease_token"] != job["lease_token"]:
            return
        db.execute("UPDATE body_jobs SET state=%s,error=%s,available_at=now()+interval '30 seconds' WHERE id=%s", ("queued" if retry else "failed", message, job["id"]))
        if not retry:
            if job["tryon_id"]:
                db.execute("UPDATE body_tryons SET state='failed',error=%s WHERE id=%s AND state<>'cancelled'", (message, job["tryon_id"]))
            else:
                db.execute("UPDATE body_scans SET state='failed',error=%s WHERE id=%s AND state NOT IN ('deleted','rejected')", (message, job["scan_id"]))


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    last_sweep = 0
    while not stopping:
        try:
            if time.monotonic() - last_sweep > 30:
                sweep()
                last_sweep = time.monotonic()
            job = claim()
            if job:
                try:
                    process(job)
                except Exception as error:
                    logging.warning("Task failed kind=%s class=%s", job["kind"], type(error).__name__)
                    fail(job, error)
            else:
                time.sleep(2)
        except Exception as error:
            logging.error("Worker unavailable class=%s", type(error).__name__)
            time.sleep(5)


if __name__ == "__main__":
    main()
