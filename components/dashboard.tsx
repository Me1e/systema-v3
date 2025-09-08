import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardClient } from './dashboard-client';

async function getDashboardData() {
  try {
    // In development, this will be proxied to the Python backend by the rewrite in next.config.mjs
    // In production, this needs to point to the deployed backend URL.
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/api/dashboard`, {
      cache: 'no-store', // We want fresh data for the dashboard
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `Failed to fetch dashboard data: ${res.status} ${errorText}`
      );
      return { timeline: [], tasks: [] };
    }

    return res.json();
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return { timeline: [], tasks: [] };
  }
}

export async function Dashboard() {
  const data = await getDashboardData();

  return (
    <div className="flex-1 flex-col overflow-y-auto border-r bg-black text-gray-300">
      <header className="h-16 flex items-center justify-between p-6 border-b border-neutral-800 bg-black sticky top-0 z-10">
        <h1 className="text-xl font-bold text-white">UXRLab</h1>
        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            className="bg-transparent border-neutral-700 hover:bg-neutral-900 hover:text-white"
          >
            <Link href="/files">
              <FileText className="mr-2 h-4 w-4" />
              파일 목록
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="bg-transparent border-neutral-700 hover:bg-neutral-900 hover:text-white"
          >
            <Link href="/files/new">
              <Plus className="mr-2 h-4 w-4" />
              문서 추가
            </Link>
          </Button>
        </div>
      </header>
      <DashboardClient initialData={data} />
    </div>
  );
}
