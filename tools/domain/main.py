from fastapi import FastAPI
from pydantic import BaseModel
import httpx, os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

class DomainRequest(BaseModel):
    url: str

@app.post("/check-domain")
async def check_domain(req: DomainRequest):
    domain = req.url.replace("https://","").replace("http://","").split("/")[0]
    
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
            age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(created[:10]).replace(tzinfo=timezone.utc)).days
            risk = "high" if age_days < 90 else "medium" if age_days < 365 else "low"
            age_label = f"{age_days} days old"
        else:
            risk = "unknown"
            age_label = "could not determine"

    except Exception as e:
        return {"domain": domain, "error": str(e), "risk": "unknown"}

    return {
        "domain": domain,
        "created": created,
        "age": age_label,
        "risk": risk,
        "verdict": f"Domain is {age_label}. Risk level: {risk.upper()}"
    }

@app.get("/health")
def health():
    return {"status": "ok"}
