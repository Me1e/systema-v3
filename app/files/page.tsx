'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  Plus,
  Network,
  Eye,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  Loader,
  Rocket,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GlobalGraphModal } from '@/components/global-graph-modal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { IngestionVisualizer } from '@/components/ingestion-visualizer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

// 데이터 fetching 함수
async function getFiles() {
  if (!supabase) return [];
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, title, created_at, status, labels ( key, value )')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching files:', error);
    return [];
  }
  return documents;
}

// 메인 페이지 컴포넌트
export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGlobalGraph, setShowGlobalGraph] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [visualizerDocId, setVisualizerDocId] = useState<string | null>(null);

  // 데이터 로딩
  useEffect(() => {
    getFiles().then((data) => {
      setFiles(data);
      setLoading(false);
    });
  }, []);

  // API 호출 함수
  const callApi = async (
    endpoint: string,
    method: string,
    body?: any,
    successMessage?: string
  ) => {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || '알 수 없는 오류가 발생했습니다.');
    }
    if (successMessage) {
      toast.success(successMessage);
    }
    return result;
  };

  // 액션 핸들러
  const handleAction = async (
    docId: string,
    action: 'ingest' | 'rechunk' | 'delete',
    confirmMessage?: string
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setActionStates((prev) => ({ ...prev, [docId]: true }));

    try {
      switch (action) {
        case 'ingest':
          toast.info('문서 수집을 시작합니다...');
          await callApi(
            '/api/ingest',
            'POST',
            { document_id: docId },
            '수집 요청 성공!'
          );
          break;
        case 'rechunk':
          toast.info('문서 재처리를 시작합니다...');
          await callApi(
            `/api/ingest/${docId}/rechunk`,
            'POST',
            null,
            '재처리 요청 성공!'
          );
          setTimeout(() => window.location.reload(), 2000);
          break;
        case 'delete':
          await callApi(
            `/api/ingest/${docId}`,
            'DELETE',
            null,
            '문서가 삭제되었습니다.'
          );
          setFiles((prev) => prev.filter((f) => f.id !== docId));
          break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`${action} 실패`, { description: errorMessage });
    } finally {
      setActionStates((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const getLabel = (file: any, key: string) => {
    const label = file.labels.find((l: any) => l.key === key);
    return label ? label.value : 'N/A';
  };

  return (
    <>
      <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">문서 관리</h1>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/">대시보드로 이동</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowGlobalGraph(true)}
              >
                <Network className="mr-2 h-4 w-4" />
                전체 지식 그래프
              </Button>
              <Button asChild>
                <Link href="/files/new">
                  <Plus className="mr-2 h-4 w-4" />
                  파일 추가
                </Link>
              </Button>
            </div>
          </div>

          {/* Ingest All */}
          <div className="flex justify-end mb-4">
            <Button
              variant="default"
              onClick={async () => {
                toast.info('모든 문서 수집을 시작합니다...');
                try {
                  const res = await fetch('/api/ingest_all_pending', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.detail || '오류 발생');
                  toast.success(`총 ${data.documents.length}개의 문서를 수집 시작했습니다.`);
                } catch (err: any) {
                  toast.error('전체 수집 실패', { description: err.message });
                }
              }}
            >
              <Rocket className="mr-2 h-4 w-4" />
              모두 수집하기
            </Button>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제목</TableHead>
                    <TableHead>날짜</TableHead>
                    <TableHead>참가자</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24">
                        <Loader className="mx-auto h-6 w-6 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : files.length > 0 ? (
                    files.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium">
                          {file.title}
                        </TableCell>
                        <TableCell>{getLabel(file, 'date')}</TableCell>
                        <TableCell>{getLabel(file, 'participants')}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              file.status === 'INGESTED'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {actionStates[file.id] ? (
                            <Loader className="h-5 w-5 animate-spin ml-auto" />
                          ) : file.status !== 'INGESTED' ? (
                            <Button
                              onClick={() => handleAction(file.id, 'ingest')}
                              size="sm"
                            >
                              <Rocket className="mr-2 h-4 w-4" />
                              수집 시작
                            </Button>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <Button
                                onClick={() => setVisualizerDocId(file.id)}
                                variant="outline"
                                size="sm"
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                결과 보기
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="px-2"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleAction(
                                        file.id,
                                        'rechunk',
                                        '문서를 재처리하시겠습니까? 기존 데이터는 삭제됩니다.'
                                      )
                                    }
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    재처리
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() =>
                                      handleAction(
                                        file.id,
                                        'delete',
                                        `'${file.title}' 문서를 완전히 삭제하시겠습니까?`
                                      )
                                    }
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    삭제
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24">
                        문서가 없습니다. 새 파일을 추가해주세요.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <GlobalGraphModal
        isOpen={showGlobalGraph}
        onClose={() => setShowGlobalGraph(false)}
      />
      {visualizerDocId && (
        <IngestionVisualizer
          documentId={visualizerDocId}
          isOpen={!!visualizerDocId}
          onClose={() => setVisualizerDocId(null)}
        />
      )}
    </>
  );
}
