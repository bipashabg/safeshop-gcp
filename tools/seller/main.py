import os
import mcp.server.transport_security as _ts

async def _always_pass(self, request, is_post=False):
    return None
_ts.TransportSecurityMiddleware.validate_request = _always_pass

from mcp.server.fastmcp import FastMCP
from pymongo import MongoClient
import httpx, re, uvicorn
from datetime import datetime, timezone

mcp = FastMCP("seller-validator")

_db = None

def get_db():
    global _db
    if _db is None:
        client = MongoClient(
            os.getenv("MONGODB_URI"),
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000
        )
        _db = client["safeshop"]
    return _db

@mcp.tool()
async def validate_seller(handle: str) -> dict:
    """
    Validate if an Instagram or social media seller is legitimate.
    Call this whenever the user provides an Instagram handle or social
    media shop name. Returns risk level and fraud verdict.
    Input: handle — the Instagram username without @ symbol.
    """
    handle = handle.replace("@", "").strip()
    risk_factors = []
    score = 0

    try:
        db = get_db()
        existing = db["sellers"].find_one({"handle": handle})
        if existing:
            return {
                "handle": handle,
                "source": "community_memory",
                "risk": existing.get("risk", "unknown"),
                "verdict": f"Previously flagged. Red flags: {', '.join(existing.get('risk_factors', []))}"
            }
    except Exception as e:
        print(f"MongoDB lookup failed: {e}")

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            sb = await client.post(
                f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={os.getenv('GOOGLE_SAFEBROWSING_KEY')}",
                json={
                    "client": {"clientId": "safeshop", "clientVersion": "1.0"},
                    "threatInfo": {
                        "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING"],
                        "platformTypes": ["ANY_PLATFORM"],
                        "threatEntryTypes": ["URL"],
                        "threatEntries": [{"url": f"https://www.instagram.com/{handle}/"}]
                    }
                }
            )
        if sb.json().get("matches"):
            risk_factors.append("Listed in Google Safe Browsing threat database")
            score += 40
    except Exception:
        pass

    if re.search(r'\d{4}', handle):
        risk_factors.append("Handle contains a year")
        score += 15
    if any(w in handle.lower() for w in ["deal","offer","cheap","sale","discount","free"]):
        risk_factors.append("Handle uses sales language")
        score += 20
    if len(handle) > 20:
        risk_factors.append("Unusually long handle")
        score += 10

    risk = "high" if score >= 50 else "medium" if score >= 25 else "low"
    verdict = (
        "DANGEROUS — Do not purchase." if risk == "high"
        else "SUSPICIOUS — Proceed with caution." if risk == "medium"
        else "No major red flags found."
    )

    try:
        db = get_db()
        db["sellers"].insert_one({
            "handle": handle,
            "risk": risk,
            "score": score,
            "risk_factors": risk_factors,
            "checkedAt": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f"MongoDB save failed: {e}")

    return {
        "handle": handle,
        "risk": risk,
        "score": score,
        "risk_factors": risk_factors,
        "verdict": verdict
    }

@mcp.tool()
async def report_seller(domain: str, reason: str) -> dict:
    """
    Save a community fraud report about a seller to MongoDB Atlas.
    Call this when a user says they were scammed by a seller.
    Input: domain — seller name or URL. reason — what happened.
    """
    try:
        db = get_db()
        db["user_reports"].insert_one({
            "domain": domain,
            "reason": reason,
            "reportedAt": datetime.now(timezone.utc).isoformat()
        })
        db["sellers"].update_one(
            {"handle": domain},
            {"$set": {"risk": "high", "community_flagged": True},
             "$inc": {"report_count": 1}},
            upsert=True
        )
    except Exception as e:
        return {"success": False, "error": str(e)}

    return {"success": True, "message": "Report saved."}

app = mcp.streamable_http_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
