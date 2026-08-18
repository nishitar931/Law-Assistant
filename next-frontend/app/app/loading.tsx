// app/app/loading.tsx
export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton h-28" />
      ))}
    </div>
  );
}
