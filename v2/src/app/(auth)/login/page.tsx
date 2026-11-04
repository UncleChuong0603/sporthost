import { AuthPage } from "@/features/auth/auth-page";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ message?: string }> }) { return <AuthPage mode="login" message={(await searchParams).message} />; }
