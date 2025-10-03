interface TroveListErrorProps {
  message: string;
}

export function TroveListError({ message }: TroveListErrorProps) {
  return (
    <main className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-red-400">{message}</p>
        </div>
      </div>
    </main>
  );
}
