import { AuthPage } from "@/features/auth/auth-page";
export const dynamic = "force-dynamic";
export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <AuthPage mode="signup" audience="member" next={(await searchParams).next} />; }
