import { Card, CardContent } from "@/components/ui";

export default function ProjectsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
      <Card>
        <CardContent className="space-y-3 p-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
