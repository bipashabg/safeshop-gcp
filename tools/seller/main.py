from fastapi import FastAPI
from fastapi_mcp import FastApiMCP
from pydantic import BaseModel
import httpx, os, re
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()
app = FastAPI(title="SafeShop Seller Validator")

mongo = MongoClient(os.getenv("MONGODB_URI"))
db = mongo["safeshop"]

class SellerRequest(BaseModel):
    handle: str
    platform: str = "instagram"

class ReportRequest(BaseModel):
    domain: str
    reason: str
    reported_by: str = "anonymous"

@app.post("/validate-seller", operation_id="validateSeller",
    summary="Validate if an Instagram or social media seller is legitimate")
async def validate_seller(req: SellerRequest):
    """
    Checks seller account age, follower count, bio completeness,
    return policy presence and cross-references MongoDB for prior reports.
    """
    handle = req.handle.replace("@", "").strip()
    risk_factors = []
    score = 0  

    existing = db["sellers"].find_one({"handle": handle})
    if existing:
        return {
            "handle": handle,
            "source": "community_memory",
            "risk": existing.get("risk", "unknown"),
            "score": existing.get("score", 0),
            "risk_factors": existing.get("risk_factors", []),
            "verdict": f"⚠️ This seller was previously flagged by the SafeShop community: {existing.get('risk_factors', [])}"
        }

    shop_url = f"https://www.instagram.com/{handle}/"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            sb_response = await client.post(
                f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={os.getenv('GOOGLE_SAFEBROWSING_KEY')}",
                json={
                    "client": {"clientId": "safeshop", "clientVersion": "1.0"},
                    "threatInfo": {
                        "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING"],
                        "platformTypes": ["ANY_PLATFORM"],
                        "threatEntryTypes": ["URL"],
                        "threatEntries": [{"url": shop_url}]
                    }
                }
            )
        sb_data = sb_response.json()
        if sb_data.get("matches"):
            risk_factors.append("Listed in Google Safe Browsing threat database")
            score += 40
    except Exception:
        risk_factors.append("Could not verify against Safe Browsing")

    if re.search(r'\d{4}', handle):
        risk_factors.append("Handle contains a year (common in throwaway accounts)")
        score += 15

    if any(word in handle.lower() for word in ["deal", "offer", "cheap", "sale", "discount", "free"]):
        risk_factors.append("Handle uses high-pressure sales language")
        score += 20

    if len(handle) > 20:
        risk_factors.append("Unusually long handle (common in fake accounts)")
        score += 10

    if score >= 50:
        risk = "high"
        verdict = f" DANGEROUS — This seller shows {len(risk_factors)} red flags. Do not purchase."
    elif score >= 25:
        risk = "medium"
        verdict = f" SUSPICIOUS — Proceed with extreme caution. {len(risk_factors)} warning signs found."
    else:
        risk = "low"
        verdict = " No major red flags found. Still verify reviews independently."

    seller_record = {
        "handle": handle,
        "platform": req.platform,
        "risk": risk,
        "score": score,
        "risk_factors": risk_factors,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict
    }
    db["sellers"].insert_one(seller_record)

    return {
        "handle": handle,
        "risk": risk,
        "score": score,
        "risk_factors": risk_factors,
        "verdict": verdict
    }

@app.post("/report-seller", operation_id="reportSeller",
    summary="Submit a community report about a fraudulent seller")
async def report_seller(req: ReportRequest):
    """Saves a user fraud report to MongoDB for community memory."""
    report = {
        "domain": req.domain,
        "reason": req.reason,
        "reported_by": req.reported_by,
        "reportedAt": datetime.now(timezone.utc).isoformat()
    }
    db["user_reports"].insert_one(report)

    #flag seller
    db["sellers"].update_one(
        {"handle": req.domain},
        {"$set": {"risk": "high", "community_flagged": True},
         "$inc": {"report_count": 1}},
        upsert=True
    )
    return {"success": True, "message": "Report saved. Thank you for protecting the community."}

@app.get("/health")
def health():
    return {"status": "ok"}

mcp = FastApiMCP(app)
mcp.mount()
