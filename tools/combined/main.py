import os
import mcp.server.transport_security as _ts

from review import analyse_reviews_logic
from delivery import track_delivery_logic

async def _always_pass(self, request, is_post=False):
    return None
_ts.TransportSecurityMiddleware.validate_request = _always_pass

from mcp.server.fastmcp import FastMCP
from pymongo import MongoClient
import httpx, re, uvicorn
from datetime import datetime, timezone

mcp = FastMCP("safeshop")

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

#domain tool

@mcp.tool()
async def check_domain(url: str) -> dict:
    """
    Check if a website domain is suspicious based on its age.
    Call this when user provides a website URL or domain name.
    Returns domain age in days and risk level low, medium or high.
    """
    domain = url.replace("https://","").replace("http://","").split("/")[0]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://www.whoisxmlapi.com/whoisserver/WhoisService",
                params={
                    "apiKey": os.getenv("WHOIS_API_KEY"),
                    "domainName": domain,
                    "outputFormat": "JSON"
                }
            )
        data = r.json()
        created = data.get("WhoisRecord", {}).get("createdDate", "unknown")
        if created != "unknown":
            age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(
                created[:10]).replace(tzinfo=timezone.utc)).days
            risk = "high" if age_days < 90 else "medium" if age_days < 365 else "low"
            age_label = f"{age_days} days old"
        else:
            risk = "unknown"
            age_label = "could not determine"
    except Exception as e:
        return {"domain": domain, "error": str(e), "risk": "unknown"}

    return {
        "domain": domain,
        "age": age_label,
        "risk": risk,
        "verdict": f"Domain is {age_label}. Risk: {risk.upper()}"
    }

#seller tool

@mcp.tool()
async def validate_seller(handle: str) -> dict:
    """
    Validate if an Instagram or social media seller is legitimate.
    Call this when user provides an Instagram handle or shop name.
    Returns risk level and fraud verdict.
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
    Save a community fraud report to MongoDB Atlas.
    Call this when a user says they were scammed by a seller.
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

#reviews analyser

@mcp.tool()
async def analyse_reviews(product_url: str) -> dict:
    """
    Analyse product reviews for fake or manipulated patterns.
    Call this when user provides an Amazon, Flipkart or any 
    e-commerce product URL and wants to verify review authenticity.
    Returns fake score and specific signals detected.
    """

    return await analyse_reviews_logic(product_url)

#delivery tracker

@mcp.tool()
async def track_delivery(tracking_number: str, carrier: str) -> dict:
    """
    Check a delivery tracking number for fraud anomalies.
    Call this when user provides a tracking number and carrier name.
    Also generates a dispute letter template if delivery fraud is detected.
    Returns anomalies found and a pre-filled dispute template.
    """

    return await track_delivery_logic(tracking_number, carrier)

app = mcp.streamable_http_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
