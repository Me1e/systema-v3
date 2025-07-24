from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest
# RAG 서비스는 다음 단계에서 구현됩니다.
from app.services.rag_service import get_chat_response_stream

router = APIRouter()

@router.post("/chat")
async def chat_with_document(request: ChatRequest):
    """
    사용자 질문에 대해 스트리밍으로 답변을 생성합니다.
    """
    # 빈 질문 체크
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="질문을 입력해주세요.")
    
    try:
        response_stream = get_chat_response_stream(request.question)
        return StreamingResponse(
            response_stream, 
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # nginx 버퍼링 비활성화
            }
        )
    except Exception as e:
        # 더 상세한 에러 로깅
        import traceback
        print(f"Chat API Error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        
        # 사용자에게 더 친절한 에러 메시지
        error_message = "채팅 응답 생성 중 오류가 발생했습니다."
        if "Neo4j" in str(e):
            error_message = "데이터베이스 연결 오류가 발생했습니다."
        elif "embedding" in str(e).lower():
            error_message = "임베딩 생성 중 오류가 발생했습니다."
        
        raise HTTPException(status_code=500, detail=error_message)
