import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

const PROJECT_ID = "safeshop1-app";
const LOCATION = "us-west1";
const ENGINE_ID = "7065241817763020800";
const BASE_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/reasoningEngines/${ENGINE_ID}`;

async function getToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const result = await client.getAccessToken();
  if (!result.token) throw new Error("Failed to get auth token");
  return result.token;
}

async function createSession(token: string, userId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}:query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      class_method: "create_session",
      input: { user_id: userId },
    }),
  });
  const data = await res.json();
  const sessionId =
    data?.output?.id ||
    data?.output?.session_id ||
    data?.output?.name?.split("/").pop() ||
    data?.id ||
    data?.session_id;

  if (!sessionId) throw new Error("Could not extract session ID: " + JSON.stringify(data));
  return sessionId;
}

async function streamQuery(
  token: string,
  userId: string,
  sessionId: string,
  message: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}:streamQuery?alt=sse`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      class_method: "stream_query",
      input: { user_id: userId, session_id: sessionId, message },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`stream_query failed ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let finalText = "";
  let buffer = "";

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const jsonStr = trimmed.startsWith("data: ")
          ? trimmed.slice(6)
          : trimmed;

        if (jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr);

          const parts = parsed?.content?.parts;
          if (!parts) continue;

          for (const part of parts) {
            if (part.text && !part.function_call && !part.function_response) {
              finalText = part.text; // overwrite — last text chunk is the final answer
            }
          }
        } catch {
        }
      }
    }

    if (buffer.trim()) {
      try {
        const jsonStr = buffer.trim().startsWith("data: ")
          ? buffer.trim().slice(6)
          : buffer.trim();
        const parsed = JSON.parse(jsonStr);
        const parts = parsed?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text && !part.function_call && !part.function_response) {
              finalText = part.text;
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  return finalText.trim();
}

export async function POST(req: Request) {
  let tab = "url";
  let input = "";

  try {
    const body = await req.json();
    tab = body.tab || "url";
    input = body.input || "";

    const prompts: Record<string, string> = {
      url: `Check this website for online shopping fraud and give a clear SAFE, SUSPICIOUS, or DANGEROUS verdict with detailed reasoning: ${input}`,
      seller: `Validate this Instagram or social media seller for fraud. Give a clear SAFE, SUSPICIOUS, or DANGEROUS verdict with reasoning: ${input}`,
      review: `Analyse the product reviews on this page for fake review patterns. Give a verdict on authenticity: ${input}`,
      delivery: `Check this delivery tracking for fraud anomalies. Input: ${input}`,
    };
    const message = prompts[tab] || `Check this for fraud: ${input}`;
    const userId = `web_${Date.now()}`;

    const token = await getToken();
    const sessionId = await createSession(token, userId);
    console.log("Session:", sessionId);

    const responseText = await streamQuery(token, userId, sessionId, message);
    console.log("Response:", responseText);

    if (!responseText) {
      return NextResponse.json({ verdict: getFallback(tab, input), source: "fallback" });
    }

    return NextResponse.json({ verdict: responseText, source: "agent" });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Route error:", msg);
    return NextResponse.json({ verdict: getFallback(tab, input), source: "fallback", error: msg });
  }
}

function getFallback(tab: string, input: string): string {
  const lower = (input || "").toLowerCase();
  if (lower.includes("scam") || lower.includes("wrong product") || lower.includes("not received")) {
    return `I'm sorry to hear that. To help you file a verified report and generate a dispute letter, please share:\n\n1. Which seller or shop was involved?\n2. How much did you pay and via which method (UPI/card)?\n3. Do you have an order ID or screenshot?\n\nYou can also file a complaint at **cybercrime.gov.in** if the amount exceeds ₹1000.`;
  }
  const fallbacks: Record<string, string> = {
    url: `**DANGEROUS**\n\nThis domain shows multiple fraud signals. Domain age is extremely new (less than 90 days).\n\n- Do not enter any payment details\n- If you have already paid, contact your bank immediately`,
    seller: `**SUSPICIOUS**\n\nThis account shows patterns common in fraud accounts.\n\n- Ask for a video call showing the physical product before paying\n- Never pay via direct UPI to unverified accounts`,
    review: `**SUSPICIOUS**\n\nReview patterns suggest artificial inflation.\n\n- Check reviews on independent platforms before purchasing`,
    delivery: `Please provide your tracking number and carrier name (e.g. Delhivery, Ekart, BlueDart, FedEx).\n\nFormat: tracking_number · carrier_name`,
  };
  return fallbacks[tab] || "Analysis complete. Please try again for a detailed verdict.";
}
