"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface User {
  role: "admin" | "worker";
  is_active: boolean;
}

interface WorkerSummary {
  user_id: string;
}

interface Stats {
  total_workers: number;
  active_today: number;
  late_today: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    total_workers: 0,
    active_today: 0,
    late_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    Promise.all([
      api.get<User[]>("/users"),
      api.get<{ workers: WorkerSummary[] }>(`/reports/hours?from_date=${today}&to_date=${today}`),
      api.get<unknown[]>(`/reports/alerts?from_date=${today}&to_date=${today}`),
    ])
      .then(([usersRes, hoursRes, alertsRes]) => {
        const workers = usersRes.data.filter(
          (u) => u.role === "worker" && u.is_active
        );
        setStats({
          total_workers: workers.length,
          active_today: hoursRes.data.workers.length,
          late_today: alertsRes.data.length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [today]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Panel de Control</h1>
      <p className="text-muted-foreground mb-6 capitalize">
        {format(new Date(), "EEEE, d 'de' MMMM yyyy")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Trabajadores activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? "—" : stats.total_workers}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Fichajes hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? "—" : stats.active_today}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Retrasos hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${
                stats.late_today > 0 ? "text-red-600" : ""
              }`}
            >
              {loading ? "—" : stats.late_today}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
