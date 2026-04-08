import { api, setAccessToken } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin" | "worker";
  scheduled_start?: string;
  geo_consent: boolean | null;
  privacy_notice_accepted: boolean | null;
  company_id: string | null;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const resp = await api.post<{ access_token: string }>("/auth/login", {
    email,
    password,
  });

  const token = resp.data.access_token;
  setAccessToken(token);

  // Decode JWT payload (no crypto needed, just decode base64)
  const payload = JSON.parse(atob(token.split(".")[1]));
  return {
    id: payload.sub,
    email,
    full_name: payload.full_name ?? "",
    role: payload.role,
    geo_consent: payload.geo_consent ?? null,
    privacy_notice_accepted: payload.privacy_notice_accepted ?? null,
    company_id: payload.company_id ?? null,
  };
}

export async function logoutUser(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    setAccessToken(undefined);
  }
}
