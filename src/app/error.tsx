"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="max-w-sm text-center">
        <h1 className="font-serif text-2xl font-normal">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred. Your data is safe."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-muted-foreground/60">
            {error.digest}
          </p>
        )}
      </div>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
