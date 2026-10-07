export function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5 text-center text-ink-muted">
      {children}
    </div>
  );
}
