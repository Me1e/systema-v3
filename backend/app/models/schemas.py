from pydantic import BaseModel
from typing import Optional

class IngestRequest(BaseModel):
    document_id: str

class IngestResponse(BaseModel):
    success: bool
    message: str
    document_id: str

class ChatRequest(BaseModel):
    question: str

# ChatResponse는 스트리밍을 사용하므로, 여기서는 별도 정의하지 않음.
# 스트리밍의 각 청크는 문자열이 될 것임.
