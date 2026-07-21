"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { taskStatusLabels } from "@/lib/project-utils";

const columns = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "WAITING",
  "COMPLETED",
] as const;

export function ProjectBoard({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: any[];
}) {
  const [items, setItems] = useState(tasks);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const move = (taskId: string, status: string) => {
    const previous = items;
    setError("");
    setItems(
      items.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );
    startTransition(async () => {
      const response = await fetch("/api/projects/tasks/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      if (!response.ok) {
        setItems(previous);
        const body = await response.json().catch(() => ({}));
        setError(body.error || "The task could not be moved.");
      }
    });
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Drag cards between columns, or use the accessible move menu on each
        task. {pending ? "Saving..." : ""}
      </p>
      {error ? (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 overflow-x-auto pb-2 xl:grid-cols-7">
        {columns.map((status) => (
          <Card
            key={status}
            className="min-w-[250px] bg-slate-50/70"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dragged && move(dragged, status)}
          >
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center justify-between text-sm">
                {taskStatusLabels[status]}
                <Badge
                  tone={
                    status === "BLOCKED"
                      ? "danger"
                      : status === "COMPLETED"
                        ? "success"
                        : "outline"
                  }
                >
                  {items.filter((task) => task.status === status).length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-3 py-3">
              {items
                .filter((task) => task.status === status)
                .map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragged(task.id)}
                    className="rounded-xl border border-sourcehub-border bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${projectId}?task=${task.id}`}
                          className="font-medium text-sourcehub-text hover:text-sourcehub-primary"
                        >
                          {task.title}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {task.taskReference} · {task.priority}
                        </p>
                        {task.dueDate ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <label className="mt-3 block text-xs text-slate-500">
                      <span className="sr-only">Move task</span>
                      <select
                        value={task.status}
                        onChange={(event) => move(task.id, event.target.value)}
                        className="w-full rounded-lg border border-sourcehub-border bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="BACKLOG">Backlog</option>
                        <option value="TODO">To do</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="BLOCKED">Blocked</option>
                        <option value="IN_REVIEW">In review</option>
                        <option value="WAITING">Waiting</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    </label>
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
