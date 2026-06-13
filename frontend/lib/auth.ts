import { api, unwrap } from "@/lib/api";
import type { ApiEnvelope, User } from "@/types";

export interface AuthResult {
  user: User;
  access_token: string;
}

export async function signup(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult> {
  const res = await api.post<ApiEnvelope<AuthResult>>("/auth/signup", input);
  return unwrap(res.data);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const res = await api.post<ApiEnvelope<AuthResult>>("/auth/login", input);
  return unwrap(res.data);
}

export async function refresh(): Promise<{ access_token: string }> {
  const res = await api.post<ApiEnvelope<{ access_token: string }>>(
    "/auth/refresh",
    {},
  );
  return unwrap(res.data);
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function me(): Promise<{ user: User }> {
  const res = await api.get<ApiEnvelope<{ user: User }>>("/auth/me");
  return unwrap(res.data);
}
