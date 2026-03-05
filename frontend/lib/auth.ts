import { api } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin" | "worker";
  scheduled_start?: string;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const resp = await api.post<{ access_token: string }>("/auth/login", {
    email,
    password,
  });

  const token = resp.data.access_token;
  if (typeof window !== "undefined") {
    window.__accessToken = token;
  }

  // Decode JWT payload (no crypto needed, just decode base64)
  const payload = JSON.parse(atob(token.split(".")[1]));
  return {
    id: payload.sub,
    email,
    full_name: payload.full_name ?? "",
    role: payload.role,
  };
}

export async function logoutUser(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    if (typeof window !== "undefined") {
      window.__accessToken = undefined;
    }
  }
}
