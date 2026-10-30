import type { Metadata } from "next";
import { TaskView } from "@/components/task-view";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <TaskView taskKey={decodeURIComponent(key)} />;
}
