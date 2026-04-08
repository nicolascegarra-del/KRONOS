"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { User } from "lucide-react"
import UserProfileCard, { UserProfile } from "@/components/UserProfileCard"

export default function WorkerProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [monthlyReport, setMonthlyReport] = useState(false)
  const [togglingReport, setTogglingReport] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<UserProfile>("/workers/me"),
      api.get<{ monthly_report_enabled: boolean }>("/workers/me/preferences"),
    ]).then(([profileRes, prefRes]) => {
      setProfile(profileRes.data)
      setMonthlyReport(prefRes.data.monthly_report_enabled ?? false)
    }).catch(console.error).finally(() => setLoadingProfile(false))
  }, [])

  const toggleMonthlyReport = async (val: boolean) => {
    setTogglingReport(true)
    try {
      await api.put("/workers/me/preferences", { monthly_report_enabled: val })
      setMonthlyReport(val)
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingReport(false)
    }
  }

  if (loadingProfile) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <User className="w-5 h-5" />
        Mi perfil
      </h1>

      {profile && <UserProfileCard profile={profile} readonlyHint />}

      {/* Notification preferences */}
      <div className="bg-white border rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 border-b pb-2">Notificaciones</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Resumen mensual de fichajes por email</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recibirás un resumen de tus fichajes del mes anterior el día 1 de cada mes.
            </p>
          </div>
          <Switch
            checked={monthlyReport}
            onCheckedChange={toggleMonthlyReport}
            disabled={togglingReport}
          />
        </div>
      </div>
    </div>
  )
}
