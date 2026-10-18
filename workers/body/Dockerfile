FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends blender libgl1 libgomp1 libglib2.0-0 libxrender1 libxi6 libxkbcommon0 && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
RUN useradd --uid 10001 --create-home worker
USER worker
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
CMD ["python", "worker.py"]
