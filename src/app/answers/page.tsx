import { AnswersBoard } from "@/components/AnswersBoard";

export const dynamic = "force-dynamic";

export default function AnswersPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-[0.2em] text-muted">Memory</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Application answers</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Each question keeps one answer — the latest save wins. Default answers from your profile are listed on the profile page.
      </p>
      <div className="mt-8">
        <AnswersBoard />
      </div>
    </div>
  );
}
