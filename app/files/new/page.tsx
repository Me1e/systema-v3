'use client';

import { useActionState, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

import { addDocument } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

const initialState = {
  message: '',
  success: false,
};

export default function FileAdditionPage() {
  const [labels, setLabels] = useState([
    { key: 'date', value: '' },
    { key: 'participants', value: '' },
    { key: 'location', value: '' },
  ]);
  const [state, formAction] = useActionState(addDocument, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast({
        title: '문서 저장 성공',
        description: '문서가 성공적으로 저장되었습니다.',
      });
      router.push('/files');
    } else if (state.message) {
      toast({
        title: '문서 저장 실패',
        description: state.message,
        variant: 'destructive',
      });
    }
  }, [state.success, state.message, router]);

  const handleLabelChange = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const newLabels = [...labels];
    newLabels[index][field] = value;
    setLabels(newLabels);
  };

  const addLabel = () => {
    setLabels([...labels, { key: '', value: '' }]);
  };

  const removeLabel = (index: number) => {
    const newLabels = labels.filter((_, i) => i !== index);
    setLabels(newLabels);
  };

  return (
    <div className="flex flex-col h-full items-center justify-center bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-2xl">
        <Button asChild variant="ghost" className="mb-4 -ml-4">
          <Link href="/files">
            <ArrowLeft className="mr-2 h-4 w-4" />
            파일 목록으로 돌아가기
          </Link>
        </Button>
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">
            새 회의록 추가
          </h1>
          <form action={formAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">회의 제목</Label>
              <Input
                id="title"
                name="title"
                placeholder="예: 1분기 UX 리서치 결과 공유"
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link">출처 링크(URL, 선택)</Label>
              <Input
                id="link"
                name="link"
                type="url"
                placeholder="https://example.com/source"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">회의록 내용</Label>
              <Textarea
                id="content"
                name="content"
                placeholder="회의록 내용을 여기에 붙여넣으세요."
                required
                rows={15}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-2 block">메타데이터 레이블</Label>
              <div className="space-y-3">
                {labels.map((label, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="레이블 (예: team)"
                      value={label.key}
                      onChange={(e) =>
                        handleLabelChange(index, 'key', e.target.value)
                      }
                      className="w-1/3"
                    />
                    <Input
                      placeholder="값 (예: Core Team)"
                      value={label.value}
                      onChange={(e) =>
                        handleLabelChange(index, 'value', e.target.value)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLabel(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <input
                type="hidden"
                name="labels"
                value={JSON.stringify(labels)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLabel}
                className="mt-3"
              >
                <Plus className="mr-2 h-4 w-4" />
                레이블 추가
              </Button>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit">저장하기</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
