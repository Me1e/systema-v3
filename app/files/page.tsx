'use client';

import Link from 'next/link';
import { Plus, Network } from 'lucide-react';
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
import IngestButton from './ingest-button';

async function getFiles() {
  const { data: documents, error } = await supabase
    .from('documents')
    .select(
      `
      id,
      title,
      created_at,
      status,
      labels ( key, value )
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching files:', error);
    return [];
  }
  return documents;
}

export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [showGlobalGraph, setShowGlobalGraph] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Fetch files on client side
  useEffect(() => {
    getFiles().then((data) => {
      setFiles(data);
      setLoading(false);
    });
  }, []); // Empty dependency array to run only once

  const getLabel = (file: any, key: string) => {
    const label = file.labels.find((l: any) => l.key === key);
    return label ? label.value : 'N/A';
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
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
                {files.length > 0 ? (
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
                            file.status === 'INGESTED' ? 'default' : 'secondary'
                          }
                        >
                          {file.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <IngestButton
                          documentId={file.id}
                          isIngested={file.status === 'INGESTED'}
                        />
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
      
      {/* Global Graph Modal */}
      <GlobalGraphModal 
        isOpen={showGlobalGraph}
        onClose={() => setShowGlobalGraph(false)}
      />
    </div>
  );
}
