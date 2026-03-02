import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // for refresh cookie
});

// Attach access token from memory
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.__accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// On 401, try to refresh
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const resp = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = resp.data.access_token;
        if (typeof window !== "undefined") {
          window.__accessToken = newToken;
        }
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        if (typeof window !== "undefined") {
          window.__accessToken = undefined;
          window.location.href = "/login";
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Type augmentation for in-memory token storage
declare global {
  interface Window {
    __accessToken?: string;
  }
}
