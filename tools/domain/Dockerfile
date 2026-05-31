FROM python:3.13.12-slim
WORKDIR /app
RUN pip install fastapi uvicorn httpx pydantic python-dotenv
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
