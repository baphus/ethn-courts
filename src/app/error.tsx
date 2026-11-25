"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center bg-cream px-6 text-center">
      <h1 className="text-2xl font-extrabold text-ink">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink/70">
        An unexpected error occurred while loading this page. Please try again —
        your booking details are safe.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl public-cta-primary px-6 py-3 text-sm font-bold transition-colors"
      >
        Try again
      </button>
    </main>
  );
}
