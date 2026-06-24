import { getFallbackOrigin } from "@/lib/failover";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = process.env.DEPLOYMENT_PROVIDER?.trim() || "unknown";
  const fallback = getFallbackOrigin();

  return Response.json({
    provider,
    role: provider === "render" ? "fallback" : "primary",
    fallbackUrl: fallback,
    hasFailover: Boolean(fallback),
  });
}
