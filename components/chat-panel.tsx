'use client';

import { useState, useRef, useEffect } from 'react';
import { CornerDownLeft, Loader, FileText, Search, Brain, Sparkles, ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Chunk {
  text: string;
  preview: string;
  score: number;
  metadata: {
    document_id?: string;
    title?: string;
    [key: string]: any;
  };
}

interface GroupedSource {
  documentId: string;
  title: string;
  chunks: Chunk[];
}

type ChatStatus = 'idle' | 'analyzing' | 'searching' | 'sources_found' | 'generating' | 'complete';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: GroupedSource[];
  isLoading?: boolean;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ChatStatus>('idle');
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const currentMessageRef = useRef<string>('');

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    const userQuestion = input; // Save the input before clearing
    
    // Reset the ref for new message
    currentMessageRef.current = '';
    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    const assistantMessage: Message = { role: 'assistant', content: '', sources: [], isLoading: true };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userQuestion }), // Use saved question
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        console.log('Chunk received, size:', chunk.length);

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'status') {
                console.log('Status update:', data.status);
                setCurrentStatus(data.status);
              } else if (data.type === 'sources') {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].sources = data.sources;
                  return newMessages;
                });
              } else if (data.type === 'token') {
                console.log('Token received:', data.content.substring(0, 20) + '...');
                setCurrentStatus('generating');
                
                // Accumulate in ref first to avoid closure issues
                currentMessageRef.current += data.content;
                
                // Update state with the complete accumulated content
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = currentMessageRef.current;
                  newMessages[newMessages.length - 1].isLoading = false;
                  return newMessages;
                });
              } else if (data.type === 'done') {
                setCurrentStatus('complete');
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content =
          '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      setCurrentStatus('idle');
    }
  };

  // Status indicator component
  const StatusIndicator = () => {
    if (!isLoading || currentStatus === 'idle') return null;

    const statusConfig = {
      analyzing: { icon: Brain, text: '질문 분석 중...', color: 'text-blue-400' },
      searching: { icon: Search, text: '관련 정보 검색 중...', color: 'text-green-400' },
      sources_found: { icon: FileText, text: '참조 문서 확인 중...', color: 'text-yellow-400' },
      generating: { icon: Sparkles, text: '답변 생성 중...', color: 'text-purple-400' },
      complete: { icon: Sparkles, text: '완료', color: 'text-gray-400' }
    };

    const config = statusConfig[currentStatus] || statusConfig.analyzing;
    const Icon = config.icon;

    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border shadow-sm">
        <Icon className={`h-4 w-4 animate-pulse ${config.color}`} />
        <span className="text-sm text-neutral-700">{config.text}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full md:w-1/2 lg:w-2/5 h-screen bg-neutral-50 border-l">
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-6">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div className="flex flex-col gap-2 max-w-md">
                {m.content && (
                  <div
                    className={`p-3 rounded-lg whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-black text-white'
                        : 'bg-neutral-200 text-neutral-800'
                    }`}
                  >
                    {m.content}
                  </div>
                )}
                {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                  <Card className="p-3 bg-neutral-100">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-neutral-600" />
                      <span className="text-sm font-medium text-neutral-700">
                        참조 문서
                      </span>
                    </div>
                    <div className="space-y-3">
                      {m.sources.map((doc, docIdx) => {
                        const docKey = `${i}-${docIdx}`;
                        const isDocExpanded = expandedDocs[docKey] ?? true; // 기본값: 펼쳐진 상태
                        
                        return (
                          <div key={docIdx} className="border border-neutral-200 rounded-lg overflow-hidden">
                            {/* 문서 헤더 */}
                            <div 
                              className="flex items-center gap-2 p-3 bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors"
                              onClick={() => setExpandedDocs(prev => ({ ...prev, [docKey]: !isDocExpanded }))}
                            >
                              {isDocExpanded ? (
                                <ChevronDown className="h-4 w-4 text-neutral-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-neutral-500" />
                              )}
                              <FileCode className="h-4 w-4 text-neutral-600" />
                              <span className="text-sm font-medium text-neutral-800 flex-1">
                                {doc.title}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {doc.chunks.length}개 청크
                              </Badge>
                            </div>
                            
                            {/* 청크 목록 */}
                            {isDocExpanded && (
                              <div className="p-3 space-y-2">
                                {doc.chunks.map((chunk, chunkIdx) => {
                                  const chunkKey = `${docKey}-${chunkIdx}`;
                                  const isChunkExpanded = expandedChunks[chunkKey] ?? false;
                                  
                                  return (
                                    <div 
                                      key={chunkIdx} 
                                      className="border border-neutral-100 rounded p-2 hover:bg-neutral-50 transition-colors"
                                    >
                                      <div 
                                        className="cursor-pointer"
                                        onClick={() => setExpandedChunks(prev => ({ ...prev, [chunkKey]: !isChunkExpanded }))}
                                      >
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                          <span className="text-xs text-neutral-500">
                                            청크 {chunkIdx + 1}
                                          </span>
                                          <span className="text-xs text-neutral-500">
                                            관련도: {(chunk.score * 100).toFixed(1)}%
                                          </span>
                                        </div>
                                        <p className="text-xs text-neutral-700">
                                          {isChunkExpanded ? (
                                            <span className="whitespace-pre-wrap">{chunk.text}</span>
                                          ) : (
                                            <>
                                              {chunk.preview}
                                              {chunk.text.length > 200 && (
                                                <span className="text-blue-600 ml-1 hover:underline">
                                                  [전체 보기]
                                                </span>
                                              )}
                                            </>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          ))}
          {isLoading && currentStatus !== 'idle' && messages[messages.length - 1]?.role === 'assistant' && (
            <div className="flex justify-start">
              <StatusIndicator />
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 bg-white border-t">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="회의록에 대해 질문해보세요..."
            className="flex-1 resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
          >
            <CornerDownLeft className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
