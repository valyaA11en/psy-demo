import { Suspense } from "react";
import { VerifyEmailPanel } from "@/components/verify-email-panel";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPanel />
    </Suspense>
  );
}
