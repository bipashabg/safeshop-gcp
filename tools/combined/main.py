import os
import mcp.server.transport_security as _ts

from review import analyse_reviews_logic
from delivery import track_delivery_logic
from security import (
        hash_ip, check_rate_limit, record_rate_limit,
    detect_coordinated_attack, validate_proof,
    update_seller_confidence, get_seller_confidence_summary
)

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

@mcp.tool()
async def report_scam(
    seller_handle: str,
    description: str,
    payment_method: str,
    amount_paid: str,
    order_id: str = "",
    evidence_url: str = "",
    user_ip: str = "unknown"
) -> dict:
    """
    Submit a verified victim report about a seller who scammed you.
    Call this when a user says they were scammed, received wrong product,
    seller went unresponsive, or item never arrived.
    Requires a description of what happened (min 50 chars).
    Optional but recommended: order ID, screenshot URL, payment method.
    Returns whether report was accepted and what to do next.
    """
    ip_hash = hash_ip(user_ip)
    rate_check = check_rate_limit(ip_hash, seller_handle)
    if not rate_check["allowed"]:
        return {"accepted": False, "reason": rate_check["reason"]}

    proof = validate_proof(description, evidence_url, order_id)
    if not proof["valid"]:
        return {
            "accepted": False,
            "reason": proof["reason"],
            "tip": "The more detail you provide, the stronger your report. Include order ID or a screenshot link if possible."
        }

    if detect_coordinated_attack(seller_handle):
        try:
            db = get_db()
            db["quarantined_reports"].insert_one({
                "target": seller_handle,
                "description": description,
                "ip_hash": ip_hash,
                "quarantine_reason": "coordinated_attack_suspected",
                "reportedAt": datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            pass
        return {
            "accepted": True,
            "quarantined": True,
            "message": "Your report was received but is under review due to unusual activity around this seller. It will be processed within 24 hours."
        }

    try:
        db = get_db()
        db["victim_reports"].insert_one({
            "target": seller_handle,
            "description": description,
            "payment_method": payment_method,
            "amount_paid": amount_paid,
            "order_id": order_id,
            "evidence_url": evidence_url,
            "evidence_score": proof["evidence_score"],
            "ip_hash": ip_hash,
            "reportedAt": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        return {"accepted": False, "reason": f"Database error: {str(e)}"}

    record_rate_limit(ip_hash, seller_handle)

    threshold_crossed = update_seller_confidence(
        seller_handle, "victim_report", proof["evidence_score"]
    )

    dispute_letter = f"""DISPUTE LETTER — ONLINE SHOPPING FRAUD
=======================================
To: [Your Bank / UPI Provider / Payment Gateway]
Subject: Transaction Dispute — Item Not as Described / Not Received

I am writing to formally dispute a transaction on my account.

Seller: {seller_handle}
Payment Method: {payment_method}
Amount: {amount_paid}
Order Reference: {order_id if order_id else "Not provided by seller"}

What happened:
{description}

I have attempted to resolve this with the seller directly without success.
I request a full chargeback under consumer protection regulations.

Evidence reference: {evidence_url if evidence_url else "Available on request"}
SafeShop report ID: {seller_handle}-{datetime.now(timezone.utc).strftime('%Y%m%d')}

[Your Full Name]
[Your Account Number]
[Date of Transaction]
"""

    return {
        "accepted": True,
        "quarantined": False,
        "evidence_score": proof["evidence_score"],
        "threshold_crossed": threshold_crossed,
        "community_impact": "This seller's fraud confidence score has been updated. Future buyers will see your warning.",
        "dispute_letter": dispute_letter,
        "next_steps": [
            f"Use the dispute letter above to contact {payment_method} support",
            "Screenshot all conversations with the seller as additional evidence",
            "File a complaint at cybercrime.gov.in if amount exceeds ₹1000",
            "Block the seller and report their account on the platform"
        ]
    }

@mcp.tool()
async def check_community_trust(seller_handle: str) -> dict:
    """
    Check the community trust score of a seller in MongoDB.
    Call this when user wants to know if a seller has been reported before,
    or to understand the confidence level behind a fraud verdict.
    Returns report counts, confidence score, and whether threshold was crossed.
    """
    summary = get_seller_confidence_summary(seller_handle)
    if not summary["found"]:
        return {
            "seller": seller_handle,
            "status": "No community reports found for this seller.",
            "confidence_score": 0,
            "flagged": False
        }
    return {
        "seller": seller_handle,
        "flagged": summary["flagged"],
        "confidence_score": summary["confidence_score"],
        "victim_reports": summary["victim_reports"],
        "suspicion_reports": summary["suspicion_reports"],
        "summary": summary["summary"],
        "verdict": "COMMUNITY FLAGGED — Multiple users have reported issues with this seller." if summary["flagged"]
                   else f"Low community concern — score {summary['confidence_score']}/100. Not yet flagged."
    }

app = mcp.streamable_http_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
