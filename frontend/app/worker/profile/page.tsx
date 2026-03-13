"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Save, User } from "lucide-react"

interface WorkerProfile {
  id: string
  full_name: string
  email: string
  role: string
  scheduled_start?: string
  scheduled_end?: string
  company_id?: string
}

export default function WorkerProfilePage() {
  const { user, setUser } = useAuthStore()

  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [monthlyReport, setMonthlyReport] = useState(false)
  const [togglingReport, setTogglingReport] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<WorkerProfile>("/workers/me"),
      api.get<{ monthly_report_enabled: boolean }>("/workers/me/preferences"),
    ]).then(([profileRes, prefRes]) => {
      setProfile(profileRes.data)
      setFullName(profileRes.data.full_name)
      setEmail(profileRes.data.email)
      setMonthlyReport(prefRes.data.monthly_report_enabled ?? false)
    }).catch(console.error).finally(() => setLoadingProfile(false))
  }, [])

  // Auto-dismiss save message
  useEffect(() => {
    if (!saveMsg) return
    const t = setTimeout(() => setSaveMsg(null), 3000)
    return () => clearTimeout(t)
  }, [saveMsg])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await api.put<WorkerProfile>("/workers/me/profile", { full_name: fullName, email })
      setProfile(res.data)
      // Update auth store so header/other components reflect new name
      if (user) setUser({ ...user, full_name: res.data.full_name })
      setSaveMsg({ ok: true, text: "Datos actualizados correctamente." })
    } catch (err: any) {
      setSaveMsg({ ok: false, text: err.response?.data?.detail || "Error al guardar" })
    } finally {
      setSaving(false)
    }
  }

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

      {/* Personal data form */}
      <form onSubmit={handleSave} className="bg-white border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 border-b pb-2">Datos personales</h2>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nombre completo</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Este email se usa para iniciar sesión. Cámbialo con precaución.
          </p>
        </div>

        {profile?.scheduled_start && (
          <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground pt-1">
            <div>
              <span className="block text-xs font-medium text-slate-500">Hora entrada prevista</span>
              <span className="font-medium text-slate-700">{profile.scheduled_start.slice(0, 5)}</span>
            </div>
            {profile.scheduled_end && (
              <div>
                <span className="block text-xs font-medium text-slate-500">Hora salida prevista</span>
                <span className="font-medium text-slate-700">{profile.scheduled_end.slice(0, 5)}</span>
              </div>
            )}
          </div>
        )}

        {saveMsg && (
          <p className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-destructive"}`}>
            {saveMsg.text}
          </p>
        )}

        <Button type="submit" disabled={saving} className="flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>

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
