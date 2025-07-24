'use server';

import { supabase } from '@/lib/supabase/client';
import { revalidatePath } from 'next/cache';

export async function addDocument(prevState: any, formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  const labelsRaw = formData.get('labels') as string;

  let labels = [];
  try {
    if (labelsRaw) {
      labels = JSON.parse(labelsRaw);
    }
  } catch (e) {
    return {
      message: '레이블 데이터 형식이 올바르지 않습니다.',
      success: false,
    };
  }

  if (!title || !content) {
    return { message: '제목과 내용은 필수입니다.', success: false };
  }

  const { data: document, error: docError } = await supabase
    .from('documents')
    .insert({ title, content })
    .select()
    .single();

  if (docError || !document) {
    console.error('Supabase 문서 저장 오류:', docError);
    return {
      message: `문서 저장 실패: ${docError?.message}. Supabase 연결 정보를 확인하세요.`,
      success: false,
    };
  }

  const labelsToInsert = labels
    .filter((l: any) => l.key && l.value)
    .map((l: any) => ({
      document_id: document.id,
      key: l.key,
      value: l.value,
    }));

  if (labelsToInsert.length > 0) {
    const { error: labelError } = await supabase
      .from('labels')
      .insert(labelsToInsert);
    if (labelError) {
      console.error('Supabase 레이블 저장 오류:', labelError);
      // 이미 생성된 문서를 롤백하는 것이 좋지만, 여기서는 오류 메시지만 반환
      return {
        message: `레이블 저장 실패: ${labelError.message}`,
        success: false,
      };
    }
  }

  revalidatePath('/files');
  return { message: '문서가 성공적으로 저장되었습니다.', success: true };
}
