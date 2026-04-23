FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api ./api
COPY config ./config
COPY src ./src
COPY outputs ./outputs
COPY serve_api.py .

CMD ["python", "serve_api.py"]
