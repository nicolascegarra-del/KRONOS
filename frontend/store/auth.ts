import { create } from "zustand";
import { AuthUser, loginUser, logoutUser } from "@/lib/auth";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const user = await loginUser(email, password);
      set({ user });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await logoutUser();
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));
