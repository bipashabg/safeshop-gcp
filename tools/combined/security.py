import os
import hashlib
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient, ASCENDING
from pymongo.errors import DuplicateKeyError

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
        _ensure_indexes(_db)
    return _db

def _ensure_indexes(db):
    """Create indexes on first run."""
    db["rate_limits"].create_index(
        [("createdAt", ASCENDING)],
        expireAfterSeconds=86400,
        background=True
    )
    db["rate_limits"].create_index(
        [("ip_hash", ASCENDING), ("target", ASCENDING)],
        background=True
    )

def hash_ip(ip: str) -> str:
    """One-way hash IP for privacy."""
    return hashlib.sha256((ip + os.getenv("IP_SALT", "safeshop")).encode()).hexdigest()[:16]

def check_rate_limit(ip_hash: str, target: str) -> dict:
    """
    Returns {"allowed": True} or {"allowed": False, "reason": "..."}
    Max 3 reports per IP per target per 24 hours.
    """
    db = get_db()
    count = db["rate_limits"].count_documents({
        "ip_hash": ip_hash,
        "target": target
    })
    if count >= 3:
        return {"allowed": False, "reason": "You have already submitted 3 reports for this seller in the last 24 hours."}
    return {"allowed": True}

def record_rate_limit(ip_hash: str, target: str):
    db = get_db()
    db["rate_limits"].insert_one({
        "ip_hash": ip_hash,
        "target": target,
        "createdAt": datetime.now(timezone.utc)
    })

def detect_coordinated_attack(target: str, window_minutes: int = 60) -> bool:
    """
    Returns True if 50+ reports arrived for the same target in the last hour.
    These get quarantined, not applied.
    """
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    count = db["suspicion_reports"].count_documents({
        "target": target,
        "reportedAt": {"$gte": since.isoformat()}
    })
    return count >= 50

def validate_proof(description: str, evidence_url: str = "", order_id: str = "") -> dict:
    """
    Validates that a victim report has sufficient proof.
    Returns {"valid": True, "evidence_score": int} or {"valid": False, "reason": str}
    """
    evidence_score = 0
    issues = []

    # Description must be substantive
    if len(description.strip()) < 50:
        issues.append("Please describe what happened in more detail (at least 50 characters)")
    else:
        evidence_score += 30

    # Bonus points for additional evidence
    if order_id and len(order_id) > 4:
        evidence_score += 30
    if evidence_url and (evidence_url.startswith("http") or evidence_url.startswith("https")):
        evidence_score += 40

    if issues:
        return {"valid": False, "reason": " · ".join(issues), "evidence_score": evidence_score}

    return {"valid": True, "evidence_score": evidence_score}

def update_seller_confidence(target: str, report_type: str, evidence_score: int = 0):
    """
    Updates seller confidence score in MongoDB.
    - suspicion_report: +10 points (low weight)
    - victim_report: +40 to +70 points based on evidence score
    Sellers cross 70 threshold = flagged in community memory.
    """
    db = get_db()

    if report_type == "victim_report":
        points = 40 + int((evidence_score / 100) * 30)
    else:
        points = 10

    db["sellers"].update_one(
        {"handle": target},
        {
            "$inc": {
                "confidence_score": points,
                f"{report_type}_count": 1
            },
            "$set": {"lastReportAt": datetime.now(timezone.utc).isoformat()}
        },
        upsert=True
    )

    seller = db["sellers"].find_one({"handle": target})
    if seller and seller.get("confidence_score", 0) >= 70:
        db["sellers"].update_one(
            {"handle": target},
            {"$set": {"risk": "high", "community_flagged": True}}
        )
        return True  # Threshold crossed
    return False

def get_seller_confidence_summary(target: str) -> dict:
    """Returns a human-readable summary of community reports."""
    db = get_db()
    seller = db["sellers"].find_one({"handle": target})
    if not seller:
        return {"found": False}

    score = seller.get("confidence_score", 0)
    suspicion_count = seller.get("suspicion_report_count", 0)
    victim_count = seller.get("victim_report_count", 0)

    return {
        "found": True,
        "confidence_score": score,
        "flagged": score >= 70,
        "suspicion_reports": suspicion_count,
        "victim_reports": victim_count,
        "summary": f"{victim_count} confirmed victim report(s) and {suspicion_count} suspicion report(s). Fraud confidence score: {score}/100."
    }
