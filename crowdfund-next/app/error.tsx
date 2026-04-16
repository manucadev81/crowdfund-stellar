'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 flex flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold text-red-200">Algo deu errado</h1>
      <p className="text-zinc-400 text-sm max-w-md text-center">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-white text-zinc-950 px-5 py-2 text-sm font-medium hover:bg-zinc-200"
      >
        Tentar de novo
      </button>
    </div>
  );
}
