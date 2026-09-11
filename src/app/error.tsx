"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-muted">JobLink</p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">This page could not load</h1>
      <p className="mt-3 text-muted">Reload to try again. If it keeps failing, start the local server on port 3001.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 h-11 rounded-xl bg-ink px-5 text-paper"
      >
        Reload
      </button>
    </div>
  );
}
