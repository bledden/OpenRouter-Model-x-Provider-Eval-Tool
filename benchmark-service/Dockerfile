# Production Dockerfile for benchmark-service
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies including those needed for playwright and other benchmarks
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    ca-certificates \
    gnupg \
    # Playwright dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI from official Docker repo for SWE-bench and other Docker-dependent benchmarks
RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install optional benchmark dependencies
# SWE-bench (software engineering benchmark)
RUN pip install --no-cache-dir "inspect-evals[swe_bench]" || echo "swe_bench optional deps failed"

# MLE-bench (machine learning engineering)
RUN pip install --no-cache-dir "inspect-evals[mle_bench]" || echo "mle_bench optional deps failed"

# GAIA (web browsing tasks) + install browsers
RUN pip install --no-cache-dir "inspect-evals[gaia]" || echo "gaia optional deps failed"
RUN pip install --no-cache-dir playwright && playwright install chromium --with-deps || echo "playwright install failed"

# SciKnowEval (gensim works on Python 3.12)
RUN pip install --no-cache-dir gensim || echo "gensim install failed"

# Copy application code
COPY . .

# Create non-root user with docker group access
RUN groupadd -g 999 docker || true && \
    useradd -m -u 1000 -G docker appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')"

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
