"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function Home() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role === "superadmin") {
      router.replace("/superadmin/dashboard");
    } else if (user.role === "admin") {
      router.replace("/admin/dashboard");
    } else {
      router.replace("/worker/dashboard");
    }
  }, [user, router]);

  return null;
}
