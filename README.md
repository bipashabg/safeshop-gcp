# SafeShop 
### AI-Powered Online Shopping Fraud Detection Agent

SafeShop is a conversational AI agent that investigates the full online shopping fraud chain that includes fake sellers, cloned checkout pages, manipulated reviews, and delivery fraud. Every scan strengthens a community fraud database powered by MongoDB Atlas.

**Live demo:** https://safeshop-155586116526.asia-south1.run.app


## The Problem

Millions of people lose money to online shopping fraud every year. Existing tools like F-Secure's shopping checker or Google Safe Browsing only check one signal at a time and none of them cover the social commerce fraud explosion happening on sites like Instagram and WhatsApp. Victims have no automated way to file disputes or warn others.

**$2 billion+ is lost to online shopping scams annually.** Most people find out too late.

## What SafeShop Does

SafeShop intercepts the full fraud chain in a single conversation:

| Fraud Type | What we check |
|---|---|
| Fake websites | Domain age, SSL certificate, registration patterns |
| Instagram/ Social media shops | Handle heuristics, Safe Browsing, community memory |
| Bot and fake product reviews | Burst timing, generic language, rating anomalies via Gemini |
| Delivery fraud | Tracking number validation, dispute letter generation |
| Victim reports | Verified scam reports with evidence scoring and chargeback letters |

---

## Why It's Different

| Feature | SafeShop | F-Secure Checker | Google Safe Browsing |
|---|---|---|---|
| Domain age check | ✓ | ✓ | ✗ |
| Instagram shop detection | ✓ | ✗ | ✗ |
| Fake review analysis | ✓ | ✗ | ✗ |
| Delivery fraud detection | ✓ | ✗ | ✗ |
| AI plain-language verdict | ✓ | ✗ | ✗ |
| Dispute letter generator | ✓ | ✗ | ✗ |
| Community fraud memory | ✓ | ✗ | Partial |
| Conversational follow-up | ✓ | ✗ | ✗ |
| Bot flood protection | ✓ | ✗ | ✗ |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                       │
│          Next.js SPA · Cloud Run (asia-south1)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Google Agent Platform                     │
│         SafeShop-Agent · Gemini 1.5 Pro · us-west1          │
│         Google Search · URL Context (built-in)              │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP (streamable-http)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SafeShop Combined MCP Server                   │
│              Python · FastMCP · Cloud Run                   │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐    │
│  │ check_domain │  │validate_seller│  │analyse_reviews │    │
│  │  WHOIS API   │  │ Safe Browsing │  │  Gemini + HTML │    │
│  └──────────────┘  └───────────────┘  └────────────────┘    │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │track_delivery│  │ report_scam   │  │check_community   │  │
│  │ Heuristics + │  │ Proof validate│  │    _trust        │  │
│  │ Carrier URLs │  │ + dispute gen │  │ Confidence score │  │
│  └──────────────┘  └───────────────┘  └──────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │ pymongo
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas (M0)                       │
│                                                             │
│  sellers · domains · reviews · delivery_cases               │
│  victim_reports · suspicion_reports · rate_limits           │
│  quarantined_reports · user_reports                         │
│                                                             │
│  TTL indexes · Confidence scoring · Attack detection        │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent | Google Cloud Agent Platform (Gemini 1.5 Pro) |
| MCP Server | Python 3.11 · FastMCP 1.27.2 · Streamable HTTP |
| Frontend | Next.js 16 · TypeScript · Tailwind CSS |
| Database | MongoDB Atlas M0 · pymongo |
| Hosting | Google Cloud Run (asia-south1) |
| External APIs | WHOIS XML API · Google Safe Browsing · AfterShip |
| Security | IP hashing · Rate limiting · TTL indexes · Confidence scoring |

---

## MongoDB Integration

MongoDB Atlas is the core memory layer of SafeShop. It enables:

**Community Memory**: Every seller/domain checked gets stored. A seller flagged by one user is instantly known to all future users. The agent queries Atlas before running expensive API calls.

**Confidence Scoring**: Sellers don't get binary flagged/not-flagged. They accumulate a 0–100 confidence score: suspicion reports add +10 points, victim reports add +40–70 points based on evidence quality. Crossing 70 = community flagged.

**Bot Flood Protection**: MongoDB TTL indexes auto-expire rate limit records after 24 hours. IP hashes (SHA-256, never raw IPs) prevent the same source from flooding reports.

**Attack Detection**: MongoDB aggregations detect coordinated attacks: 50+ reports for the same target in 60 minutes = quarantined for review instead of applied.

**Collections:**

```
safeshop/
├── sellers              # Seller profiles + confidence scores
├── victim_reports       # Verified scam reports with evidence
├── suspicion_reports    # Anonymous low-weight flags  
├── rate_limits          # TTL: expires after 24h
├── quarantined_reports  # Coordinated attack suspects
├── reviews              # Product review analysis results
├── delivery_cases       # Tracking fraud records
└── user_reports         # General community reports
```

## Project Structure

```
safeshop/
├── tools/
│   └── combined/           # Single MCP server (all tools)
│       ├── main.py         # FastMCP app + domain + seller tools
│       ├── review.py       # Fake review analyser
│       ├── delivery.py     # Delivery fraud tracker
│       ├── security.py     # Rate limiting + proof validation
│       └── Dockerfile
├── frontend/               
│   ├── app/
│   │   ├── page.tsx        # Main landing page + scan UI
│   │   └── api/scan/       # API route → agent integration
│   └── Dockerfile
└── README.md
```

## Security Model

SafeShop addresses the key trust problem in community fraud databases:

**Problem:** Anyone can flood the system with false reports to maliciously flag legitimate sellers.

**Solution (layered):**

1. **Rate limiting** — Max 3 reports per IP per target per 24 hours (MongoDB TTL index)
2. **IP privacy** — Raw IPs are never stored; SHA-256 hashed with a server-side salt
3. **Proof requirement** — Victim reports require 50+ character description; evidence score scales with order ID and screenshot URL provided
4. **Confidence weighting** — Anonymous suspicion = +10pts; verified victim = +40–70pts. Threshold of 70/100 required for community flagging
5. **Coordinated attack detection** — 50+ reports in 60 minutes = quarantined automatically
6. **Verdict transparency** — Users can call `check_community_trust` to see full breakdown: how many victim reports, how many suspicion reports, exact confidence score

## Setup Guide

### Prerequisites
- Google Cloud account with billing enabled
- MongoDB Atlas account (free M0 tier)
- Node.js 20+
- Python 3.11+
- WSL 2 / Linux / macOS

### 1. Clone the repo

```bash
git clone https://github.com/bipashabg/safeshop-gcp.git
cd safeshop-gcp
```

### 2. Set up MongoDB Atlas

1. Create a free M0 cluster at mongodb.com/atlas
2. Create database `safeshop`
3. Create collections: `sellers`, `victim_reports`, `suspicion_reports`, `rate_limits`, `quarantined_reports`, `reviews`, `delivery_cases`, `user_reports`
4. Get your connection string from Connect → Drivers → Python

### 3. Set up GCP

```bash
gcloud projects create safeshop-app
gcloud config set project safeshop-app
gcloud services enable aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

### 4. Deploy the MCP server

```bash
cd tools/combined
gcloud run deploy safeshop-combined-tool \
  --source . \
  --allow-unauthenticated \
  --region asia-south1 \
  --min-instances 1 \
  --set-env-vars MONGODB_URI="your-connection-string",\
WHOIS_API_KEY="your-key",\
GOOGLE_SAFEBROWSING_KEY="your-key",\
IP_SALT="your-random-salt"
```

### 5. Set up Agent Platform

1. Go to console.cloud.google.com/agent-platform/studio
2. Create a new agent with Gemini 1.5 Pro/ 2.5 Flash
3. Add MCP Server pointing to your Cloud Run `/mcp` endpoint
4. Paste the agent instructions. (Read `INSTRUCTIONS.md`)
5. Deploy the agent

### 6. Deploy the frontend

```bash
cd frontend
# Add your agent embed snippet to app/page.tsx
gcloud run deploy safeshop-frontend \
  --source . \
  --allow-unauthenticated \
  --region asia-south1 \
  --port 3000
```

### Environment Variables

```bash
# tools/combined
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/safeshop
WHOIS_API_KEY=your-whoisxmlapi-key
GOOGLE_SAFEBROWSING_KEY=your-google-key
IP_SALT=any-random-string-for-ip-hashing

# frontend
NEXT_PUBLIC_AGENT_URL=https://your-combined-tool.run.app
AGENT_API_KEY=your-agent-api-key
```

---

## API Reference (MCP Tools)

### `check_domain(url: str)`
Checks domain age via WHOIS. Returns age in days and risk level (low/medium/high).
- < 90 days = HIGH risk
- < 365 days = MEDIUM risk
- 365+ days = LOW risk

### `validate_seller(handle: str)`
Validates Instagram/social seller. Checks MongoDB community memory first, then Google Safe Browsing, then handle heuristics.

### `analyse_reviews(product_url: str)`
Fetches product page and analyses review patterns for authenticity signals.

### `track_delivery(tracking_number: str, carrier: str)`
Validates tracking number format and generates carrier tracking URL + dispute template.

### `report_scam(seller_handle, description, payment_method, amount_paid, order_id?, evidence_url?)`
Verified victim report. Requires 50+ char description. Returns dispute letter + next steps.

### `check_community_trust(seller_handle: str)`
Returns full confidence score breakdown from MongoDB.

---

## Possible Scenarios (Demo)

**Scenario 1: Suspicious website**
```
User: check this site for me https://quick-deals-india-2024.com
Agent: [calls check_domain] → Domain is 8 days old → DANGEROUS
```

**Scenario 2: Instagram shop**
```
User: is @cheap_deals_2024 legit?
Agent: [calls validate_seller] → Community flagged, 2 victim reports → DANGEROUS
```

**Scenario 3: Victim reporting a scam**
```
User: I ordered from @fashion_deals_in and received a fake product, they're not responding
Agent: I'm sorry to hear that. Let me help you file a report and generate a dispute letter.
       What payment method did you use and how much did you pay?
User: UPI, ₹2400, order ID FD-88821
Agent: [calls report_scam] → Generates dispute letter → Gives next steps → Flags seller
```

**Scenario 4: Community memory in action**
```
User: check @fashion_deals_in
Agent: [calls validate_seller] → community_memory hit → "Previously flagged with victim report"
       → DANGEROUS without needing new API calls
```

## License

MIT License — see [LICENSE](LICENSE) file.
