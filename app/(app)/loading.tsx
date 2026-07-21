export default function AppLoading() {
  return (
    <div className="space-y-6" aria-label="Loading SourceHub">
      <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}
