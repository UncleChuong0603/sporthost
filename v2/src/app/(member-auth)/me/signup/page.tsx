import { AuthPage } from "@/features/auth/auth-page";
export const dynamic = "force-dynamic";
export default function Signup() { return <AuthPage mode="signup" audience="member" />; }
