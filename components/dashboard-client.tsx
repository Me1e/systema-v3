'use client';

import { useState, useEffect } from 'react';
import { Calendar, GitBranch, MessageSquare, LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Define types for the data received from the API
interface TimelineItem {
  period: string;
  count: number;
}

interface Source {
  type: 'meeting' | 'ref';
  title: string;
  content: string;
  link?: string | null;
}

interface Task {
  id: string;
  theme: string;
  summaries: number;
  refs: number;
  detailedSummary: string;
  sources: Source[];
}

interface DashboardData {
  timeline: TimelineItem[];
  tasks: Task[];
}

interface DashboardClientProps {
  initialData: DashboardData;
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialData.tasks || []);
  const [timeline, setTimeline] = useState<TimelineItem[]>(
    initialData.timeline || []
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    initialData.tasks && initialData.tasks.length > 0
      ? initialData.tasks[0]
      : null
  );
  const [loadingSummaries, setLoadingSummaries] = useState<
    Record<string, boolean>
  >({});
  const [summaryErrors, setSummaryErrors] = useState<Record<string, boolean>>(
    {}
  );

  // Function to load theme summary on demand
  const loadThemeSummary = async (theme: string) => {
    if (loadingSummaries[theme]) return; // Already loading

    setLoadingSummaries((prev) => ({ ...prev, [theme]: true }));

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(
        `${backendUrl}/api/dashboard/theme-summary/${encodeURIComponent(theme)}`
      );

      if (response.ok) {
        const data = await response.json();
        setTasks((prevTasks) =>
          prevTasks.map((t) =>
            t.theme === theme ? { ...t, detailedSummary: data.summary } : t
          )
        );

        // Update selected task if it's the current one
        const updatedTask = tasks.find((t) => t.theme === theme);
        if (updatedTask && selectedTask?.theme === theme) {
          setSelectedTask({ ...updatedTask, detailedSummary: data.summary });
        }
      } else {
        setSummaryErrors((prev) => ({ ...prev, [theme]: true }));
      }
    } catch (error) {
      console.error(`Failed to load summary for theme ${theme}:`, error);
      setSummaryErrors((prev) => ({ ...prev, [theme]: true }));
    } finally {
      setLoadingSummaries((prev) => ({ ...prev, [theme]: false }));
    }
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
  };

  return (
    <div className="p-6 space-y-8">
      {/* Timeline View */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Timeline
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {timeline.map((item) => (
            <div
              key={item.period}
              className="bg-neutral-900 border border-neutral-800 p-4 cursor-pointer hover:bg-neutral-800"
            >
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <p className="text-sm font-medium">{item.period}</p>
                <Calendar className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold text-white">{item.count}</div>
              <p className="text-xs text-gray-500">회의록</p>
            </div>
          ))}
        </div>
      </div>

      {/* Task Summaries */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Task Summaries
        </h3>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => handleTaskSelect(task)}
              className={cn(
                'p-3 flex items-center justify-between border border-transparent cursor-pointer hover:bg-neutral-900 hover:border-neutral-700',
                selectedTask?.id === task.id && 'bg-neutral-900 border-blue-500'
              )}
            >
              <div className="flex items-center gap-4">
                <GitBranch className="h-5 w-5 text-neutral-500" />
                <span className="font-semibold text-white">{task.theme}</span>
              </div>
              <div className="flex gap-4 text-sm text-neutral-400">
                <span>{task.summaries} 요약</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Task View */}
      {selectedTask && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Detailed View: {selectedTask.theme}
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-neutral-950 border border-neutral-800 p-4">
              <h4 className="font-semibold text-white mb-2">
                Synthesized Summary
              </h4>
              {loadingSummaries[selectedTask.theme] ? (
                <div className="space-y-2">
                  <div className="h-4 bg-neutral-800 rounded animate-pulse"></div>
                  <div className="h-4 bg-neutral-800 rounded animate-pulse w-3/4"></div>
                  <div className="h-4 bg-neutral-800 rounded animate-pulse w-1/2"></div>
                  <p className="text-xs text-gray-500 mt-2">요약 생성 중...</p>
                </div>
              ) : summaryErrors[selectedTask.theme] ? (
                <p className="text-sm text-gray-400 leading-relaxed">
                  요약을 불러올 수 없습니다. {selectedTask.theme} 테마와 관련된
                  회의록들의 종합 요약입니다.
                </p>
              ) : selectedTask.detailedSummary ? (
                <p className="text-sm text-gray-400 leading-relaxed">
                  {selectedTask.detailedSummary}
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {selectedTask.theme} 테마와 관련된 회의록들의 종합 요약을
                    보려면 클릭하세요.
                  </p>
                  <button
                    onClick={() => loadThemeSummary(selectedTask.theme)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-sm text-white transition-colors"
                  >
                    요약 생성
                  </button>
                </div>
              )}
            </div>
            <div className="lg:col-span-2 space-y-3">
              <h4 className="font-semibold text-white mb-2">Sources</h4>
              {selectedTask.sources.map((source, index) => (
                <div
                  key={index}
                  className="bg-neutral-900 border border-neutral-800 p-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    {source.type === 'meeting' ? (
                      <MessageSquare className="h-4 w-4 text-neutral-500" />
                    ) : (
                      <LinkIcon className="h-4 w-4 text-neutral-500" />
                    )}
                    <h5 className="font-medium text-white flex items-center gap-2">
                      {source.title}
                      {source.link ? (
                        <a
                          href={source.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="원문 링크 새 탭에서 열기"
                          title="원문 링크 열기"
                        >
                          <LinkIcon className="h-4 w-4" />
                        </a>
                      ) : null}
                    </h5>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-2">
                    {source.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
