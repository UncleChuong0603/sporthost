import { TokenPage } from "@/features/auth/token-page";
export const dynamic = "force-dynamic";
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; audience?: string }> }) { const query = await searchParams; return <TokenPage mode="reset" token={query.token || ""} audience={query.audience === "member" ? "member" : "host"} />; }
