import httpx
import os
from datetime import datetime, timezone

_db = None

def get_db():
    global _db
    if _db is None:
        from pymongo import MongoClient
        client = MongoClient(
            os.getenv("MONGODB_URI"),
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000
        )
        _db = client["safeshop"]
    return _db

async def track_delivery_logic(tracking_number: str, carrier: str) -> dict:
    """Core logic for delivery fraud detection."""

    result = {
        "tracking_number": tracking_number,
        "carrier": carrier,
        "anomalies": [],
        "risk": "low",
        "dispute_template": ""
    }

    tn = tracking_number.strip()

    if len(tn) < 8:
        result["anomalies"].append("Tracking number too short to be valid")
        result["risk"] = "high"

    if len(set(tn)) <= 2:
        result["anomalies"].append("Tracking number looks fake: repeated characters")
        result["risk"] = "high"

    fake_patterns = ["123456789", "000000", "111111", "XXXXXX", "FAKE"]
    if any(p in tn.upper() for p in fake_patterns):
        result["anomalies"].append("Tracking number matches known fake pattern")
        result["risk"] = "high"

    carrier_urls = {
        "delhivery": f"https://www.delhivery.com/track/package/{tn}",
        "bluedart": f"https://www.bluedart.com/tracking?trackfor={tn}",
        "dtdc": f"https://www.dtdc.in/trace.asp?strCnno={tn}",
        "ekart": f"https://ekartlogistics.com/shipmenttrack/{tn}",
        "fedex": f"https://www.fedex.com/fedextrack/?trknbr={tn}",
        "dhl": f"https://www.dhl.com/en/express/tracking.html?AWB={tn}",
        "ups": f"https://www.ups.com/track?tracknum={tn}",
    }

    carrier_lower = carrier.lower()
    tracking_url = carrier_urls.get(carrier_lower, f"https://www.google.com/search?q={carrier}+tracking+{tn}")
    result["tracking_url"] = tracking_url
    result["note"] = "Use the tracking URL above to verify delivery status directly with the carrier."

    if result["risk"] in ["medium", "high"] or result["anomalies"]:
        result["dispute_template"] = f"""DISPUTE LETTER TEMPLATE
To: [Bank / UPI App / Payment Gateway Support]
Subject: Transaction Dispute: Item Not Received

I am writing to dispute a transaction on my account.

Order Details:
- Tracking Number: {tracking_number}
- Carrier: {carrier}
- Issue: {', '.join(result['anomalies']) if result['anomalies'] else 'Item not received'}

The seller has not delivered my order as promised.
I request a full chargeback under consumer protection rules.

[Your Name]
[Transaction Date]
[Transaction Amount]
[Order Screenshot attached]"""

    try:
        db = get_db()
        db["delivery_cases"].insert_one({
            **{k: v for k, v in result.items() if k != "dispute_template"},
            "reportedAt": datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass

    return result
