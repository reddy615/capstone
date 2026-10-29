FROM node:22-bookworm-slim

ENV PYTHON=python3.11 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 python3.11 python3.11-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3.11 --version

WORKDIR /app

COPY --chown=node:node . .
USER node

RUN npm run build

CMD ["npm", "start"]
