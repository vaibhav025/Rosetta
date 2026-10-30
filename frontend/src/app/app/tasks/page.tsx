import type { Metadata } from "next";
import { Board } from "@/components/board";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return <Board />;
}
