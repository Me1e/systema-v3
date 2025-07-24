import logging
from app.core.config import settings
from supabase import create_client, Client

# Supabase 클라이언트는 필요할 때마다 생성하여 사용합니다.
# FastAPI의 의존성 주입 시스템을 사용할 수도 있습니다.

async def get_document_status(document_id: str) -> str:
    """특정 문서의 상태를 Supabase에서 조회합니다."""
    try:
        # 비동기 환경에서는 매번 클라이언트를 생성하는 것이 더 안전할 수 있습니다.
        supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        
        response = supabase_client.from_("documents").select("status").eq("id", document_id).single().execute()
        
        if response.data:
            return response.data.get("status", "UNKNOWN")
        return "NOT_FOUND"
    except Exception as e:
        logging.error(f"Supabase에서 문서 상태 조회 중 오류 발생 (ID: {document_id}): {e}", exc_info=True)
        return "ERROR" 