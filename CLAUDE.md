# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project SYSTEMA is a Korean-language intelligent meeting minutes interface built with hybrid RAG (Retrieval-Augmented Generation). It combines semantic vector search and knowledge graph queries to provide accurate, context-aware responses about meeting documents.

**Tech Stack:**
- Frontend: Next.js 15.2.4, React ^19, Tailwind CSS, Radix UI
- Backend: Python 3.11+ FastAPI with LlamaIndex orchestration
- LLM: Google Gemini 2.5 Pro (model ID: `gemini-2.5-pro`)
- Embedding: Gemini embedding-001 (768 dimensions)
- Databases: Supabase (PostgreSQL) for app data, Neo4j AuraDB for vectors + knowledge graph
- Real-time: Server-Sent Events (SSE) for streaming responses
- Visualization: React Flow, Dagre.js, D3-force for graph visualization

## Common Commands

### Development

```bash
# Run both frontend and backend in dev mode with hot reload
docker compose -f deploy/docker-compose.dev.yml up

# Run in background and follow logs
docker compose -f deploy/docker-compose.dev.yml up -d
docker compose -f deploy/docker-compose.dev.yml logs -f backend-dev next-dev | cat

# Stop dev containers
docker compose -f deploy/docker-compose.dev.yml down
```

### Building and Testing

```bash
# Build frontend (Next.js)
npm run build

# Run linter
npm run lint

# Run frontend in development
npm run dev

# Start production frontend
npm start
```

### Production Deployment

```bash
# Build and deploy all services on Hetzner VPS
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build

# View logs
docker compose -f deploy/docker-compose.yml logs -f backend next caddy | cat

# Restart specific service
docker compose -f deploy/docker-compose.yml restart backend
```

## Architecture

### Data Flow

1. **Document Ingestion** (`/api/ingest`):
   - Document + metadata saved to Supabase
   - Python backend chunks text (1024 chars, 128 overlap - optimized for Korean)
   - Each chunk embedded to 768-dim vectors → Neo4j vector index
   - Entities/relationships extracted → Neo4j knowledge graph
   - Document summary auto-generated (2-3 sentences via LLM) → saved to Supabase `summary` field
   - Document theme extracted from content → saved to Supabase `theme` field

2. **Query/Response** (`/api/chat`):
   - Question embedded → vector search in Neo4j
   - Parallel keyword search using Neo4j fulltext index
   - Results merged via Reciprocal Rank Fusion (RRF) with time-decay weighting
   - Top contexts fed to Gemini for response generation
   - Response streamed via SSE with source citations grouped by document

### Key Files and Structure

**Frontend (Next.js):**
- `app/page.tsx` - Main query interface with Dashboard + ChatPanel
- `app/files/page.tsx` - Document management page with full CRUD operations (view, ingest, rechunk, delete)
- `app/files/new/page.tsx` - New document creation form (title, content, labels, reference URL)
- `components/chat-panel.tsx` - Chat interface with SSE streaming
- `components/dashboard.tsx` - Timeline and theme-based summaries
- `components/graph-visualizer.tsx` - Knowledge graph visualization
- `components/ingestion-visualizer.tsx` - Displays document chunking results with chunk text and embedding status
- `lib/supabase/client.ts` - Client-side Supabase (anon key)
- `lib/supabase/server.ts` - Server-side Supabase (service role key)

**Backend (FastAPI):**
- `backend/app/main.py` - FastAPI app with CORS and router registration
- `backend/app/services/rag_service.py` - Core RAG logic:
  - `initialize_rag_settings()` - LLM, embedding model, Neo4j stores setup
  - `process_ingestion()` - Document chunking, embedding, KG extraction
  - `perform_hybrid_search()` - Vector + keyword search with RRF fusion and time-decay weighting
  - `time_decay_weight()` - Calculates time-based weight for search results (decay_rate=0.05)
  - `get_chat_response_stream()` - SSE streaming chat responses
- `backend/app/api/routers/chat.py` - `/api/chat` endpoint for chat queries
- `backend/app/api/routers/ingest.py` - Document ingestion endpoints:
  - `POST /api/ingest` - Start document ingestion
  - `GET /api/ingest/{id}/details` - Get chunking visualization
  - `POST /api/ingest/{id}/rechunk` - Re-process document with new chunking
  - `DELETE /api/ingest/{id}` - Delete document from Neo4j and Supabase
- `backend/app/api/routers/dashboard.py` - Dashboard statistics
- `backend/app/api/routers/graph.py` - Graph visualization data
- `backend/app/api/routers/debug.py` - Debug entity structure endpoints
- `backend/app/core/config.py` - Environment configuration with Pydantic
- `backend/app/services/supabase_service.py` - Supabase helper functions for document operations
- `backend/app/models/schemas.py` - Request/response Pydantic models for API endpoints

**Deployment:**
- `deploy/docker-compose.dev.yml` - Local development with hot reload (uses `backend-dev:8000`)
- `deploy/docker-compose.yml` - Production with Caddy reverse proxy
- `deploy/Dockerfile.next` - Next.js production build
- `deploy/Dockerfile.backend` - FastAPI with pip requirements (Python 3.11+)
- `deploy/Caddyfile` - Routes `/api/*` to backend, rest to Next.js
- `next.config.mjs` - API proxy configuration (fallback to `BACKEND_INTERNAL_URL` or `http://backend-dev:8000`)

### Important Architectural Details

**Direct API Connection:**
- Client connects directly to FastAPI (not through Next.js API routes)
- Enables unbuffered SSE streaming for real-time responses
- CORS configured for cross-origin requests
- Next.js rewrites `/api/*` to backend for SSR compatibility (configured in `next.config.mjs`)
- Development: proxies to `backend-dev:8000`, Production: uses `BACKEND_INTERNAL_URL`

**Supabase Client Patterns:**
- Use `lib/supabase/client.ts` (anon key) for client components
- Use `lib/supabase/server.ts` (service role key) for server components/actions
- Never expose service role key to client

**Python Dependencies:**
- Uses pip with `requirements.txt` (not Poetry)
- Python 3.11+ required
- Uses `llama-index-vector-stores-neo4jvector` (not `neo4j`) for Python 3.13 compatibility
- Backend Dockerfile: pip install from requirements.txt

**Neo4j Data Model:**
- `:Chunk` nodes: vectorized text chunks with `embedding` (768-dim), `text`, `document_id`
- `:Document` nodes: metadata with `id`, `title`, `created_at`, `theme`, `reference_urls` (array, populated from single `link` field)
- `:Entity` nodes: extracted entities from knowledge graph
- Relationships: `(Chunk)-[:BELONGS_TO]->(Document)`, `(Entity)-[relations]->(Entity)`
- **Primary Indexes:**
  - `vector` - Vector index on Chunk.embedding (768 dimensions, cosine similarity)
  - `keyword` - Fulltext index on Chunk.text (for BM25 keyword search)
- **Additional Performance Indexes:**
  - `document_id`, `document_theme` - Property indexes on Document nodes
  - `chunk_document_id` - Property index on Chunk nodes
  - `entity_text_index` - Fulltext index on Entity.id
  - `document_embeddings` - Vector index on Document nodes (768 dimensions)

**Hybrid Search:**
- Vector search returns cosine similarity scores (0-1, higher = more similar)
- Keyword search returns BM25-like scores with 1.5x boost
- RRF combines rankings with different weights:
  - Vector matches: `1.0 / (60 + rank + 1)`
  - Keyword matches: `1.5 / (60 + rank + 1)` [50% boost for exact keyword matches]
- Time-decay weights recent documents more: `exp(-0.05 * days_old)`
- Final ranking: `(RRF_score) × (time_decay_weight)`
- Documents appearing in both vector and keyword results rank highest

**Search Thresholds:**
- Vector search: 0.7 minimum cosine similarity (filters low-relevance results)
- Keyword search: 0.5 minimum BM25 score (filters weak keyword matches)

**Knowledge Graph Extraction:**
- Uses LLM with Korean-optimized prompts for entity and relationship extraction
- Template designed specifically for meeting minutes analysis
- Extracts: persons, organizations, projects, decisions, action items
- Creates typed relationships between entities
- Implementation: `backend/app/services/rag_service.py` lines 620-629

## Environment Variables

### Required for Development

**Frontend Configuration** - Create `.env.local` in project root:

```bash
# Supabase (from Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Backend URL (for client-side API calls)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Backend internal routing for Next.js SSR (optional, used by next.config.mjs)
# Defaults to http://backend-dev:8000 if not set
# This is used for server-side API proxying during SSR, not for client-side calls
BACKEND_INTERNAL_URL=http://backend-dev:8000
```

**Backend Configuration** - Create `backend/.env`:

```bash
# Supabase (same project as frontend)
SUPABASE_URL="https://<project-ref>.supabase.co"  # Same value as NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Neo4j AuraDB (from AuraDB Console)
NEO4J_URI="neo4j+s://<db-id>.databases.neo4j.io"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="<password>"

# Google AI Studio
GOOGLE_API_KEY="<api-key>"

# LLM Model (optional, defaults to gemini-2.5-pro)
LLM_MODEL="gemini-2.5-pro"
```

**Important Notes:**
- Frontend uses `NEXT_PUBLIC_SUPABASE_URL` (exposed to browser)
- Backend uses `SUPABASE_URL` (server-side only) - must be same Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` needed for both frontend (server actions) and backend

**Optional Variables:**
```bash
# Only needed if switching from Gemini to OpenAI embeddings
OPENAI_API_KEY="<openai-key>"  # Currently unused, Gemini is default
```

### Additional for Production

Add to server `.env`:

```bash
# Domain for Caddy ACME
APP_DOMAIN=yourdomain.com
ACME_EMAIL=your@email.com

# Backend internal routing (for Next.js SSR to reach backend)
BACKEND_INTERNAL_URL=http://backend:8000
```

**Note:** `BACKEND_INTERNAL_URL` is used by `next.config.mjs` to proxy API requests during SSR. In development, it defaults to `http://backend-dev:8000`.

## Database Setup

### Supabase Initialization

Run `backend/scripts/01-init-supabase.sql` in Supabase SQL Editor:
- Creates `documents` table (id, title, content, theme, summary, status, created_at, link)
- Creates `labels` table for document metadata (key-value pairs)
- Sets up RLS policies

### Neo4j Initialization

Run `backend/scripts/02-init-neo4j.cypher` in Neo4j Browser:
- Creates vector index on `:Chunk(embedding)` with 768 dimensions
- Creates fulltext index `keyword` on `:Chunk.text`
- Sets up constraints and indexes for Document, Entity nodes

**Critical:** Vector dimension (768) must match Gemini embedding-001 output. Changing this requires reindexing.

## Development Patterns

### Adding New Backend Endpoints

1. Create router in `backend/app/api/routers/`
2. Register in `backend/app/main.py` with `app.include_router()`
3. Use `@router.get()`, `@router.post()`, `@router.delete()` decorators as needed
4. For SSE: use `StreamingResponse` with `media_type="text/event-stream"`

### CRUD Operations for Documents

Documents support full CRUD operations:
- **Create**: Add via `/app/files/new/page.tsx` → Supabase
- **Read**: View in FilesPage, query details via `/api/ingest/{id}/details`
- **Update**: Re-process via `/api/ingest/{id}/rechunk`
- **Delete**: Remove via `DELETE /api/ingest/{id}` (removes from both Neo4j and Supabase)

### Document Lifecycle

Documents flow through these states during processing:

1. **PENDING** - User created document, awaiting ingestion trigger
2. **INGESTING** - Backend processing: chunking → embedding → KG extraction
3. **INGESTED** - Successfully processed, ready for queries
4. **FAILED** - Error during processing (check backend logs)

**User Workflows:**
- **Create Document**: Navigate to `/app/files/new`, enter title/content/labels, optionally add reference URL
- **Trigger Ingestion**: Click "Ingest" button in `/app/files` page (calls `POST /api/ingest`)
- **View Progress**: Status updates from PENDING → INGESTING → INGESTED
- **View Chunks**: Click "Details" to see chunking visualization
- **View Graph**: Click "Graph" to see extracted entities and relationships
- **Re-process**: Click "Rechunk" if ingestion failed or to change chunking parameters
- **Delete**: Click "Delete" to completely remove document and all associated data

### Document Chunking Quality Filters

The ingestion process applies several quality filters to ensure clean, useful chunks:

- **Minimum Length**: Chunks must contain at least 100 characters of actual text content (excluding images and formatting)
- **Image Removal**: Markdown image patterns (`![alt](url)`, `[image.png]`) are filtered out before length validation
- **Deduplication**: Chunks with identical first 500 characters are automatically removed to avoid redundancy
- **Implementation**: See `backend/app/services/rag_service.py:466-502` for filter logic

These filters improve search quality by removing low-information chunks and preventing duplicate context in responses.

### Working with Neo4j

```python
from app.services.rag_service import get_neo4j_driver

driver = get_neo4j_driver()
with driver.session() as session:
    result = session.run("MATCH (n:Chunk) RETURN count(n)")
    count = result.single()[0]
```

### Client-Side Data Fetching

```typescript
// Client components: use lib/supabase/client.ts (anon key)
import { supabase } from '@/lib/supabase/client'
const { data } = await supabase.from('documents').select('*')

// Server components/actions: use lib/supabase/server.ts (service role key)
import { supabase } from '@/lib/supabase/server'
const { data } = await supabase.from('documents').select('*')

// SSE streaming via POST requires fetch API (not EventSource)
const response = await fetch(`${apiUrl}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: q })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { value, done } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6))
      // Handle data.type: 'status', 'sources', 'content', 'done'
    }
  }
}

// FilesPage pattern: unified action handler with toast notifications
const handleAction = async (docId: string, action: 'ingest' | 'rechunk' | 'delete') => {
  // Uses toast.info(), toast.success(), toast.error() for user feedback
  // Updates local state after successful operations
}
```

## API Endpoints Reference

### Health Check

- `GET /` - API health check and welcome message
  - Returns: `{"message": "Welcome to the SYSTEMA backend API"}`
  - Use for: Verifying backend is running

### Chat & Search

- `POST /api/chat` - Process hybrid RAG queries with SSE streaming
  - Request body: `{ question: string }`
  - Returns: SSE stream with status updates and response chunks

### Document Management

- `POST /api/ingest` - Start document ingestion and embedding
  - Body: `{ document_id: string }`
  - Runs chunking, embedding, and KG extraction in background

- `GET /api/ingest/{document_id}/details` - Get chunking visualization
  - Returns: Document title, chunks with text and embedding status

- `GET /api/ingest/{document_id}/graph` - Get document-specific knowledge graph
  - Returns: Entities and relationships extracted from document

- `POST /api/ingest/{document_id}/rechunk` - Re-process document with new chunking
  - Use when changing chunking parameters or fixing errors

- `DELETE /api/ingest/{document_id}` - Completely delete document
  - Removes: Neo4j chunks/entities + Supabase record
  - Warning: This action is irreversible

### Dashboard & Analytics

- `GET /api/dashboard` - Get dashboard statistics
  - Returns: Document counts, recent activity, theme summaries

- `GET /api/dashboard/theme-summary/{theme}` - Generate theme synthesis
  - Asynchronously called from frontend
  - Uses LLM to synthesize summary for specific theme

- `GET /api/graph/all` - Get global knowledge graph
  - Query parameters: `limit` (optional, for nodes/edges)
  - Returns: All entities and relationships across documents

### Debug (Development Only)

- `GET /api/debug/entities` - Debug entity structure and node counts
  - Use for troubleshooting knowledge graph issues
  - Returns: Sample entities, counts, schema info

## Troubleshooting

**SSE Not Streaming:**
- Check `NEXT_PUBLIC_API_URL` points to backend (default: http://localhost:8000)
- Verify CORS allows frontend origin in `backend/app/main.py`
- Check browser network tab for failed requests

**Vector Dimension Mismatch:**
- Embedding model produces 768 dimensions
- Neo4j vector index must be configured for 768 dimensions
- Check `backend/scripts/02-init-neo4j.cypher` and `backend/app/services/rag_service.py:103`

**Keyword Search Errors:**
- Verify fulltext index `keyword` exists: `SHOW INDEXES`
- Index must target `Chunk` nodes, `text` property

**Document Status Stuck at "INGESTING":**
- Check backend logs: `docker compose -f deploy/docker-compose.dev.yml logs backend-dev`
- Verify Neo4j connectivity
- Check Gemini API quota/rate limits

**Next.js Build Errors:**
- `next.config.mjs` disables TypeScript/ESLint errors during build (lines 3-8)
- Fix actual errors before deploying to production

## CI/CD

**Workflows:**
- `.github/workflows/ci.yml` - Build validation on PR/push
- `.github/workflows/deploy.yml` - Automated deployment to Hetzner

**Required GitHub Secrets:**
- `HETZNER_SSH_KEY` - Private key for SSH (no passphrase)
- `HOST` - Server IP
- `USER` - SSH username
- `REMOTE_PATH` - Deployment directory (e.g., `/systema-v3`)
- `ENV_FILE` (optional) - Complete `.env` contents (multiline, if provided will be written to server)

**Deployment Flow:**
1. Push to `main` triggers deploy workflow
2. Code synced to server via rsync
3. Server runs `docker compose up -d --build --force-recreate`
4. Caddy auto-renews TLS certificates via ACME

## Known Constraints

- Vector search requires exact 768-dimension embeddings (Gemini embedding-001)
- Knowledge graph extraction is LLM-dependent (can be slow/expensive for large docs)
- SSE requires direct backend access (Next.js rewrites used only for SSR)
- Dev compose uses `backend-dev:8000` hostname internally, `localhost:8000` externally
- RRF algorithm favors documents that appear in both vector and keyword results
