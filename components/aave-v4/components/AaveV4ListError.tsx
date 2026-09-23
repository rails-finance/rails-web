interface Props {
  message: string;
}

export function AaveV4ListError({ message }: Props) {
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-red-400">{message}</p>
        </div>
      </div>
    </div>
  );
}
