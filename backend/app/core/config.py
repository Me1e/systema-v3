import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Neo4j
    NEO4J_URI: str
    NEO4J_USERNAME: str
    NEO4J_PASSWORD: str

    # OpenAI (옵션: 현재 임베딩은 Gemini 사용)
    OPENAI_API_KEY: str | None = None

    # Google
    GOOGLE_API_KEY: str

    # Model Names
    LLM_MODEL: str = "gemini-2.5-pro"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
