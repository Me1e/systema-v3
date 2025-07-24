from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routers import chat, ingest, dashboard, debug, graph  # Import routers

app = FastAPI(
    title="Project SYSTEMA Backend",
    description="API for intelligent Korean data interface",
    version="1.0.0",
)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simplicity, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(ingest.router, prefix="/api", tags=["Ingestion"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"]) # Register the dashboard router
app.include_router(debug.router, prefix="/api", tags=["Debug"])
app.include_router(graph.router, prefix="/api", tags=["Graph"])

@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to the SYSTEMA backend API"}
