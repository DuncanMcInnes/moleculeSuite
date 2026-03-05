# moleculeSuite

A protein biochemistry visualisation suite — interactive tools for exploring molecular structures, sequence data, and biochemical annotations.

## Architecture

```
moleculeSuite/
├── packages/
│   ├── api/      # Python FastAPI backend
│   └── web/      # React TypeScript Vite frontend
├── docker-compose.yml
├── .env.example
└── README.md
```

## Services

| Service | URL (dev) | Description |
|---------|-----------|-------------|
| `api`   | http://localhost:8000 | FastAPI REST + async endpoints |
| `web`   | http://localhost:5173 | React/Vite UI |

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Or run services individually:

```bash
# Backend
cd packages/api
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd packages/web
npm install
npm run dev
```

## API Docs

Interactive Swagger UI is available at http://localhost:8000/docs when the API is running.
