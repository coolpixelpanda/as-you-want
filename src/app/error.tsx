"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
      <p className="mt-3 text-muted">
        Reload to try again. On Vercel, set <code>DATABASE_URL</code> to a Postgres database and{" "}
        <code>OPENAI_API_KEY</code> in project environment variables.
      </p>
      <Button className="mt-6" variant="primary" icon={RotateCcw} onClick={() => reset()}>
        Reload
      </Button>
    </div>
  );
}
