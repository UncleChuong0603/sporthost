import { AuthPage } from "@/features/auth/auth-page";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ message?: string; next?: string }> }) { const query = await searchParams; return <AuthPage mode="login" audience="member" message={query.message} next={query.next} />; }
