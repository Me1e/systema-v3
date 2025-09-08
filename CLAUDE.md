# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project SYSTEMA is an intelligent Korean data interface for processing and querying Korean-language meeting minutes. It uses a hybrid RAG (Retrieval-Augmented Generation) approach combining semantic vector search with structured knowledge graph queries.

## Key Commands

### Frontend (Next.js)

```bash
pnpm dev      # Start development server at http://localhost:3000
pnpm build    # Create production build
pnpm start    # Start production server
pnpm lint     # Run ESLint (currently errors are ignored in builds)
```

### Backend (FastAPI)

```bash
cd backend
uvicorn app.main:app --reload  # Start backend at http://localhost:8000
```

## Architecture

### Tech Stack

- **Frontend**: Next.js 15.2.4, React 19, Tailwind CSS, Radix UI
- **Backend**: Python FastAPI, LlamaIndex
- **AI/LLM**: Google Gemini 2.5 Pro Latest (generation), Gemini embedding-001 (768 dims)
- **Databases**: Supabase (PostgreSQL), Neo4j AuraDB
- **Real-time**: Server-Sent Events (SSE) for streaming responses
- **Graph Visualization**: React Flow, @dagrejs/dagre, d3-force, d3-scale

### API Structure

The backend exposes the following endpoints:

- `/api/chat` - Handles chat queries using hybrid RAG with source citations (SSE streaming)
- `/api/ingest` - Processes documents for indexing
- `/api/ingest/{id}/details` - Returns chunking visualization data
- `/api/ingest/{id}/graph` - Returns knowledge graph entities and relationships
- `/api/dashboard` - Provides dashboard statistics with synthesized summaries
- `/api/graph/all` - Returns entire knowledge graph data with configurable limits

Prod: Caddy reverse-proxies `/api/*` to FastAPI on the same domain; Dev: Next.js rewrite proxies `/api/*` to `http://127.0.0.1:8000`.

### Data Flow

1. **Document Ingestion**: Admin UI → `/api/ingest` → LlamaIndex → Neo4j/Supabase
2. **Query Processing**: Chat UI → `/api/chat` → Hybrid retrieval → LLM generation

### Database Schema

**Supabase (PostgreSQL)**:

- `documents` table: Stores document content and status (PENDING, INGESTING, INGESTED, FAILED)
- `labels` table: Key-value metadata for documents

**Neo4j**:

- Document nodes with vector embeddings (768 dimensions)
- Chunk nodes for document segments
- Knowledge graph entities and relationships
- Vector and fulltext indexes for hybrid search

## Development Notes

### Environment Variables

- `.env.local` (frontend dev only):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- `backend/.env` (backend secrets):

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=
GOOGLE_API_KEY=
LLM_MODEL=gemini-2.5-pro
```

- Server `.env` (Docker Compose runtime):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=
GOOGLE_API_KEY=
LLM_MODEL=gemini-2.5-pro
APP_DOMAIN=
ACME_EMAIL=
```

### Database Initialization

1. Run `backend/scripts/01-init-supabase.sql` for Supabase tables
2. Run `backend/scripts/02-init-neo4j.cypher` for Neo4j indexes

### UI Design Philosophy

- Palantir-inspired clean, professional interface
- Two-column layout: Dashboard (left) + Chatbot (right)
- Dark theme with sharp, minimal design
- Interactive timeline and task summaries

### Important Patterns

- TypeScript errors are ignored during builds (for rapid development)
- CORS is currently open (needs restriction for production)
- All AI operations happen in Python backend, not frontend
- Frontend focuses purely on UI/UX concerns
- Same-domain API via Caddy in prod; Next.js rewrite in dev
- Real-time SSE streaming with status updates (analyzing → searching → generating)
- Source citations are included in chat responses with relevance scores
- Ingestion visualization shows chunks and graph nodes/relationships
- Dashboard synthesizes summaries using LLM for first 2 themes
- Chat UI shows real-time progress with animated status indicators
- Knowledge graph visualization uses force-directed layout with connectivity-based positioning
- Graph layout options: Force (natural network) and Dagre (hierarchical)
- Isolated nodes positioned on outer circle, highly connected nodes near center
- Dynamic node sizing based on entity count for optimal viewport usage
- Chat responses use useRef to prevent React state closure issues
- Backend URL must be http://localhost:8000 (not 3000) for proper connection
- Entity label in Neo4j is `Entity` (not `__Entity__`)

### Known Issues and Future Improvements

- Chunking/query performance optimization needed
- Task unit clarification and summary format improvements
- Production security hardening (CORS restrictions, API keys)
- Better error handling and retry logic for streaming
