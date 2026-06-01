"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-[#fbfbfd] p-6 font-sans">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-[#1d1d1f]">حدث خطأ</h1>
          <p className="mt-2 text-sm text-[#6e6e73]">جرّب تحديث الصفحة.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-[#0071e3] px-6 py-2.5 text-sm font-medium text-white"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
