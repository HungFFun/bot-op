export function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center text-stone-500">
      {children}
    </div>
  );
}
