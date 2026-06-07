import httpx
import os
import re
from datetime import datetime, timezone
from pymongo import MongoClient

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

async def analyse_reviews_logic(product_url: str) -> dict:
    """Core logic for review analysis, called by the MCP tool."""
    
    results = {
        "product_url": product_url,
        "signals": [],
        "fake_score": 0,
        "verdict": ""
    }

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            r = await client.get(product_url, headers=headers)
            html = r.text

        # 1. suspiciously high rating with very few reviews
        rating_match = re.search(r'(\d\.\d)\s*out of\s*5', html)
        review_count_match = re.search(r'([\d,]+)\s*(global\s*)?ratings', html)

        if rating_match and review_count_match:
            rating = float(rating_match.group(1))
            count = int(review_count_match.group(1).replace(",", ""))
            if rating >= 4.8 and count < 50:
                results["signals"].append(
                    f"Suspiciously high rating ({rating}) with very few reviews ({count})"
                )
                results["fake_score"] += 30

        # 2. similar review pattern (many reviews mention same date/event)
        verified_count = html.count("Verified Purchase")
        unverified_count = html.count("Unverified Purchase") + html.count("unverified")
        if unverified_count > verified_count and verified_count > 0:
            results["signals"].append(
                f"More unverified purchases ({unverified_count}) than verified ({verified_count})"
            )
            results["fake_score"] += 25

        # 3. generic praise phrases common in fake reviews
        generic_phrases = [
            "exactly as described", "highly recommend", "great product",
            "five stars", "love it", "perfect", "amazing quality",
            "fast shipping", "as expected"
        ]
        html_lower = html.lower()
        matched = [p for p in generic_phrases if p in html_lower]
        if len(matched) >= 4:
            results["signals"].append(
                f"High density of generic review phrases: {', '.join(matched[:4])}"
            )
            results["fake_score"] += 20

        # Signal 4 — no critical reviews (1-2 star)
        one_star = re.search(r'1 star[^%]*?(\d+)%', html)
        two_star = re.search(r'2 star[^%]*?(\d+)%', html)
        if one_star and two_star:
            critical = int(one_star.group(1)) + int(two_star.group(1))
            if critical < 3:
                results["signals"].append(
                    f"Almost no critical reviews (only {critical}% 1-2 star) — suspicious"
                )
                results["fake_score"] += 25

    except Exception as e:
        results["signals"].append(f"Could not analyse page: {str(e)}")
        results["fake_score"] = -1

    score = results["fake_score"]
    if score >= 60:
        results["verdict"] = "DANGEROUS: High probability of fake reviews. Do not trust ratings."
    elif score >= 30:
        results["verdict"] = "SUSPICIOUS: Some fake review signals detected. Check independently."
    elif score == -1:
        results["verdict"] = "UNKNOWN: Could not fetch page for analysis."
    else:
        results["verdict"] = "LIKELY AUTHENTIC: No strong fake review signals detected."

    try:
        db = get_db()
        db["reviews"].insert_one({
            **results,
            "checkedAt": datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass

    return results
