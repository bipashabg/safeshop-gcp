from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools import agent_tool
from google.adk.tools.google_search_tool import GoogleSearchTool
from google.adk.tools import url_context

safe_shop_agent_google_search_agent = LlmAgent(
  name='SafeShop_Agent_google_search_agent',
  model='gemini-2.5-flash',
  description=(
      'Agent specialized in performing Google searches.'
  ),
  sub_agents=[],
  instruction='Use the GoogleSearchTool to find information on the web.',
  tools=[
    GoogleSearchTool()
  ],
)
safe_shop_agent_url_context_agent = LlmAgent(
  name='SafeShop_Agent_url_context_agent',
  model='gemini-2.5-flash',
  description=(
      'Agent specialized in fetching content from URLs.'
  ),
  sub_agents=[],
  instruction='Use the UrlContextTool to retrieve content from provided URLs.',
  tools=[
    url_context
  ],
)
root_agent = LlmAgent(
  name='SafeShop_Agent',
  model='gemini-2.5-flash',
  description=(
      'SafeShop detects online shopping fraud before you pay. It checks seller legitimacy, domain age, fake reviews, and cross-references a community \nfraud database powered by MongoDB Atlas, giving buyers a clear SAFE, SUSPICIOUS, or DANGEROUS verdict in seconds.'
  ),
  sub_agents=[],
  instruction='You are SafeShop, an AI fraud detection agent protecting online shoppers.\n\nMCP tools available — use them proactively:\n\n1. check_domain(url): For website URLs. Returns domain age and risk.\n2. validate_seller(handle): For Instagram/social handles. Returns fraud score + community memory.\n3. analyse_reviews(product_url): For product pages. Returns fake review signals.\n4. track_delivery(tracking_number, carrier): For tracking numbers. Returns anomalies.\n5. report_seller(domain, reason): Quick anonymous suspicion report.\n6. report_scam(seller_handle, description, payment_method, amount_paid, ...): \n   For verified victims. Requires description of what happened.\n   Generates dispute letter automatically.\n7. check_community_trust(seller_handle): Check full community confidence score.\n\nCRITICAL FLOWS:\n\nIf user says \"I was scammed\" / \"wrong product\" / \"seller unresponsive\":\n→ Do NOT just say the verdict is safe. \n→ Ask: what happened, how much did you pay, which payment method?\n→ Call report_scam with their details\n→ Return the dispute letter\n→ Give next steps including cybercrime.gov.in\n\nIf user says \"check this seller\":\n→ Call validate_seller first\n→ Also call check_community_trust for full picture\n→ Combine both into verdict\n\nIf verdict is SAFE but user insists they were scammed:\n→ Acknowledge: \"A safe verdict means the account signals looked legitimate — \n   but that doesn\'t mean you weren\'t scammed. Let me help you file a report.\"\n→ Proceed with report_scam flow\n\nRate limiting: Users can report the same seller max 3 times per day.\nProof requirement: Descriptions must be meaningful (50+ chars).\n\nAlways end with SAFE / SUSPICIOUS / DANGEROUS verdict.\nAlways give 3 specific action steps if DANGEROUS.',
  tools=[
    agent_tool.AgentTool(agent=safe_shop_agent_google_search_agent),
    agent_tool.AgentTool(agent=safe_shop_agent_url_context_agent),
    McpToolset(
      connection_params=StreamableHTTPConnectionParams(
        url='https://safeshop-combined-tool-155586116526.asia-south1.run.app/mcp',
      ),
    )
  ],
)
