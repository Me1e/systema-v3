# GEMINI.md

## Project Overview

This is a full-stack application that provides an intelligent interface for Korean meeting minutes. The project, named "Project SYSTEMA," uses a hybrid Retrieval-Augmented Generation (RAG) approach, combining semantic vector search and a knowledge graph to provide accurate and context-aware answers.

The frontend is built with Next.js, React, and Tailwind CSS, while the backend is a Python application using the FastAPI framework. LlamaIndex is used for orchestrating the RAG pipeline. The system uses Supabase (PostgreSQL) for the application database and Neo4j for the vector and graph database. Google's Gemini models are used for both embedding and generation.

## Building and Running

The recommended way to run the project for local development is using Docker Compose.

**1. Set up Environment Variables:**

Create a `.env.local` file in the project root and add the following, filling in your actual credentials:

```
# Supabase connection info
NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-supabase-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<your-supabase-service-role-key>"

# Neo4j connection info
NEO4J_URI="neo4j+s://<your-db-id>.databases.neo4j.io"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="<your-neo4j-password>"

# Google Gemini API Key
GOOGLE_API_KEY="your-google-api-key"

# API URL (backend server address)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**2. Initialize Databases:**

*   **Supabase:** Execute the SQL script in `backend/scripts/01-init-supabase.sql` in the Supabase SQL Editor.
*   **Neo4j:** Execute the Cypher script in `backend/scripts/02-init-neo4j.cypher` in the Neo4j Browser.

**3. Run the Application:**

Use the following Docker Compose command to start both the frontend and backend services:

```bash
docker compose -f deploy/docker-compose.dev.yml up
```

To run in the background and view logs:

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
docker compose -f deploy/docker-compose.dev.yml logs -f backend-dev next-dev
```

## Development Conventions

*   **Frontend:** The frontend is a Next.js application. Standard development practices for Next.js apply.
    *   Run `pnpm dev` for development.
    *   Run `pnpm build` to build for production.
    *   Run `pnpm start` to start a production server.
    *   Run `pnpm lint` to lint the code.
*   **Backend:** The backend is a FastAPI application.
    *   The development server uses `uvicorn --reload` for automatic reloading on code changes.
*   **API:** The frontend communicates with the backend via API endpoints. The main endpoints are:
    *   `/api/chat`: Handles chat queries with SSE streaming.
    *   `/api/ingest`: For document indexing.
    *   `/api/dashboard`: For dashboard statistics.
    *   `/api/graph/all`: For the global knowledge graph.
*   **CI/CD:** GitHub Actions are used for CI and deployment.
    *   `.github/workflows/ci.yml`: Runs on PRs and pushes to main to verify builds.
    *   `.github/workflows/deploy.yml`: Deploys the application to a server.
