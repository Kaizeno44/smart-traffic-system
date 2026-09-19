FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Torch (CPU) — cài trước để tận dụng cache layer
RUN pip install --no-cache-dir torch torchvision \
    --extra-index-url https://download.pytorch.org/whl/cpu

# Cài toàn bộ còn lại qua requirements.txt (bao gồm cả paddlepaddle 2.6.2)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade "pip<25" && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]