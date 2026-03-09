import hmac
import hashlib
import os
import uvicorn
import logging
from fastapi import FastAPI, Request, Header, HTTPException, status

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

SECRET_TOKEN = os.getenv("SECRET_TOKEN", "your_secret_token_here").encode('utf-8')


async def verify_signature(request: Request, signature: str):
    if not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Hub-Signature-256 header is missing")

    # GitHub sends 'sha256=' prefix, so remove it
    try:
        hash_type, hash_value = signature.split('=', 1)
        if hash_type != 'sha256':
            raise ValueError("Signature is not a SHA256 hash")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Hub-Signature-256 header format")

    body = await request.body()
    mac = hmac.new(SECRET_TOKEN, body, hashlib.sha256)
    if not hmac.compare_digest(mac.hexdigest(), hash_value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="X-Hub-Signature-256 mismatch")


@app.post("/")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(None, alias="X-GitHub-Event"),
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
):
    await verify_signature(request, x_hub_signature_256)
    logger.info(f"Received GitHub event: {x_github_event}")
    return {"message": "Webhook received successfully!"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
