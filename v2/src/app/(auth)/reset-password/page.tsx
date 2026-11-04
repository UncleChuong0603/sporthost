import { TokenPage } from "@/features/auth/token-page";
export const dynamic = "force-dynamic";
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <TokenPage mode="reset" token={(await searchParams).token || ""} />; }
