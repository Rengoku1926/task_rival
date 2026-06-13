import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/store/authStore";
import type { ApiEnvelope, ApiError } from "@/types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export class ApiException extends Error {
  code: string;
  fields?: Record<string, string>;
  status?: number;

  constructor(error: ApiError, status?: number) {
    super(error.message);
    this.code = error.code;
    this.fields = error.fields;
    this.status = status;
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiEnvelope<{ access_token: string }>>(
        `${API_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then((res) => res.data.data?.access_token ?? null)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes("/auth/")
    ) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        useAuthStore.getState().setAccessToken(newToken);
        original.headers.set("Authorization", `Bearer ${newToken}`);
        return api(original);
      }
      useAuthStore.getState().clear();
    }

    const envelope = error.response?.data;
    if (envelope?.error) {
      return Promise.reject(new ApiException(envelope.error, error.response?.status));
    }
    return Promise.reject(error);
  },
);

export function unwrap<T>(envelope: ApiEnvelope<T>): T {
  return envelope.data as T;
}
