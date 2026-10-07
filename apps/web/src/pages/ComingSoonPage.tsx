export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="py-10 text-center">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-ink-muted">Chức năng đang được xây dựng.</p>
    </div>
  );
}
