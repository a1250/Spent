import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <FileQuestion className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="max-w-sm text-center">
        <h1 className="font-serif text-2xl font-normal">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
      </div>
      <Button variant="outline" render={<Link href="/" />}>
        Go to dashboard
      </Button>
    </div>
  );
}
