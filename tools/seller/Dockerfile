FROM python:3.13.12-slim
WORKDIR /app
RUN pip install "mcp[cli]" httpx pymongo python-dotenv uvicorn
COPY main.py .
CMD ["python", "main.py"]
