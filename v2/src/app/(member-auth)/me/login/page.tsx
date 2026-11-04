import { AuthPage } from "@/features/auth/auth-page";
export const dynamic = "force-dynamic";
export default function Login() { return <AuthPage mode="login" audience="member" />; }
