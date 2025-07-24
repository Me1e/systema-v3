'use client';

import { useState } from 'react';
import { Loader, Rocket, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IngestionVisualizer } from '@/components/ingestion-visualizer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface IngestButtonProps {
  documentId: string;
  isIngested: boolean;
}

export default function IngestButton({
  documentId,
  isIngested,
}: IngestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [rechunking, setRechunking] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showRechunkDialog, setShowRechunkDialog] = useState(false);

  const handleIngest = async () => {
    setLoading(true);
    toast.info('문서 수집(Ingestion)을 시작합니다...', {
      description: `Document ID: ${documentId}`,
    });

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: documentId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || '알 수 없는 오류가 발생했습니다.');
      }

      toast.success('문서 수집 요청 성공!', {
        description:
          '백그라운드에서 처리 작업이 시작되었습니다. 완료되면 상태가 변경됩니다.',
      });
      // 페이지를 새로고침하여 상태 변경을 유도할 수 있습니다.
      // window.location.reload();
    } catch (error) {
      console.error('Ingestion error:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error('수집 요청 실패', {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRechunk = async () => {
    setRechunking(true);
    toast.info('문서 재청킹을 시작합니다...', {
      description: `기존 데이터를 삭제하고 다시 처리합니다.`,
    });

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/ingest/${documentId}/rechunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || '알 수 없는 오류가 발생했습니다.');
      }

      toast.success('재청킹 요청 성공!', {
        description: '백그라운드에서 처리 작업이 시작되었습니다.',
      });
      
      // 3초 후 페이지 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('Rechunk error:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error('재청킹 요청 실패', {
        description: errorMessage,
      });
    } finally {
      setRechunking(false);
      setShowRechunkDialog(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button onClick={handleIngest} disabled={loading || isIngested} size="sm">
          {loading ? (
            <Loader className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="mr-2 h-4 w-4" />
          )}
          {isIngested ? '수집 완료' : loading ? '처리 중...' : '수집 시작'}
        </Button>
        {isIngested && (
          <>
            <Button
              onClick={() => setShowVisualizer(true)}
              variant="outline"
              size="sm"
            >
              <Eye className="mr-2 h-4 w-4" />
              결과 보기
            </Button>
            <Button
              onClick={() => setShowRechunkDialog(true)}
              variant="outline"
              size="sm"
              disabled={rechunking}
            >
              {rechunking ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              재청킹
            </Button>
          </>
        )}
      </div>
      
      <IngestionVisualizer
        documentId={documentId}
        isOpen={showVisualizer}
        onClose={() => setShowVisualizer(false)}
      />
      
      <AlertDialog open={showRechunkDialog} onOpenChange={setShowRechunkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>문서를 재청킹하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 기존의 모든 청크와 관련 데이터를 삭제하고 문서를 처음부터 다시 처리합니다.
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleRechunk}>재청킹 시작</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
