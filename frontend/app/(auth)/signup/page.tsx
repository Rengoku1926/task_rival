import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <div>
      <h2 className="mb-6 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Create your account
      </h2>
      <SignupForm />
    </div>
  );
}
