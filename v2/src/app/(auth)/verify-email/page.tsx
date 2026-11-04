import { TokenPage } from "@/features/auth/token-page";
export const dynamic = "force-dynamic";
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; audience?: string }> }) { return <TokenPage mode="verify" token={(await searchParams).token || ""} audience={(await searchParams).audience === "member" ? "member" : "host"} />; }
