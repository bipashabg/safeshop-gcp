import vertexai
from vertexai import agent_engines
from agent import root_agent

PROJECT_ID = "safeshop1-app"
LOCATION = "us-west1"  
STAGING_BUCKET = "gs://155586116526-vertex-stage"

print("Initializing Vertex AI...")
vertexai.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)

print("Wrapping ADK agent configuration into an AdkApp interface...")
playable_app = agent_engines.AdkApp(agent=root_agent, app_name="SafeShop_Agent_App")

print("Deploying multi-agent system to Vertex AI Agent Engine...")
remote_app = agent_engines.create(
    agent_engine=playable_app,
    display_name="SafeShop_Agent",
    description="SafeShop AI fraud detection multi-agent system powered by ADK and MCP.",
    requirements=[
        "google-adk>=2.0.0",
        "google-cloud-aiplatform[agent_engines,adk]>=1.90.0",
        "mcp>=0.1.0"
    ],
    extra_packages=["agent.py"]
)

print("\n Deployment Started Successfully!")
print(f"Resource Path: {remote_app.resource_name}")

engine_id = remote_app.resource_name.split("/")[-1]
print(f" Update your Next.js route file environment variable to:")
print(f"   GCP_REASONING_ENGINE_ID=\"{engine_id}\"")
