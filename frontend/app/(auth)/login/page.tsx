import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div>
      <h2 className="mb-6 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Log in to your account
      </h2>
      <LoginForm />
    </div>
  );
}
