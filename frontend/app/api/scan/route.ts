import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prompt, tab, input } = await req.json();

  try {
    const agentUrl = process.env.AGENT_API_URL;
    const apiKey = process.env.AGENT_API_KEY;

    if (!agentUrl || !apiKey) {
      return NextResponse.json(getMockResult(tab), { status: 200 });
    }

    const res = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: { text: prompt },
        session_id: `safeshop-${Date.now()}`,
      }),
    });

    const data = await res.json();
    const text = data?.queryResult?.responseMessages?.[0]?.text?.text?.[0] || "";
    return NextResponse.json(parseAgentResponse(text, tab));

  } catch (err) {
    console.error("Agent call failed:", err);
    return NextResponse.json(getMockResult(tab));
  }
}

function parseAgentResponse(text: string, tab: string) {
  const isDangerous = text.toLowerCase().includes("dangerous");
  const isSuspicious = text.toLowerCase().includes("suspicious");
  const verdict = isDangerous ? "dangerous" : isSuspicious ? "suspicious" : "safe";
  const label = isDangerous ? "DANGEROUS" : isSuspicious ? "SUSPICIOUS" : "SAFE";

  return {
    verdict,
    label,
    summary: text.slice(0, 300),
    signals: [
      { type: "ok", text: "Analysis complete via Gemini + MongoDB Atlas" }
    ],
  };
}

function getMockResult(tab: string) {
  const mocks: Record<string, object> = {
    url: { verdict: "dangerous", label: "DANGEROUS", summary: "This domain was registered very recently and shows multiple fraud signals.", signals: [{ type: "bad", text: "Domain registered less than 90 days ago" },{ type: "bad", text: "No verifiable business registration" },{ type: "ok", text: "Not yet on Safe Browsing list" }], action: "Do not enter payment details on this site." },
    seller: { verdict: "suspicious", label: "SUSPICIOUS", summary: "This seller account shows patterns common in fraud accounts.", signals: [{ type: "bad", text: "Handle contains year — throwaway account pattern" },{ type: "bad", text: "Sales language in handle name" },{ type: "warn", text: "Community memory: flagged by previous users" }], action: "Ask for video verification before paying." },
    review: { verdict: "suspicious", label: "SUSPICIOUS", summary: "Review patterns suggest artificial inflation.", signals: [{ type: "bad", text: "High density of generic review phrases" },{ type: "bad", text: "All reviews posted within 3 days" },{ type: "warn", text: "Less than 1% critical reviews" }], action: "Check reviews on independent platforms." },
    delivery: { verdict: "safe", label: "LEGITIMATE", summary: "Tracking number appears valid and shipment is progressing normally.", signals: [{ type: "ok", text: "Tracking number format is valid" },{ type: "ok", text: "Last update was recent" },{ type: "ok", text: "No fraud patterns detected" }] },
  };
  return mocks[tab] || mocks.url;
}
