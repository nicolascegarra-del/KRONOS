"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { User, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import UserProfileCard, { UserProfile } from "@/components/UserProfileCard"

const CONTRACT_TYPES = [
  { value: "indefinido", label: "Indefinido" },
  { value: "temporal", label: "Temporal" },
  { value: "practicas", label: "Prácticas" },
  { value: "formacion", label: "Formación" },
  { value: "autonomo", label: "Autónomo" },
]

const CCAA_OPTIONS = [
  { value: "ES-AN", label: "Andalucía" },
  { value: "ES-AR", label: "Aragón" },
  { value: "ES-AS", label: "Asturias" },
  { value: "ES-IB", label: "Illes Balears" },
  { value: "ES-CN", label: "Canarias" },
  { value: "ES-CB", label: "Cantabria" },
  { value: "ES-CL", label: "Castilla y León" },
  { value: "ES-CM", label: "Castilla-La Mancha" },
  { value: "ES-CT", label: "Cataluña" },
  { value: "ES-EX", label: "Extremadura" },
  { value: "ES-GA", label: "Galicia" },
  { value: "ES-RI", label: "La Rioja" },
  { value: "ES-MD", label: "Madrid" },
  { value: "ES-MC", label: "Murcia" },
  { value: "ES-NC", label: "Navarra" },
  { value: "ES-PV", label: "País Vasco" },
  { value: "ES-VC", label: "C. Valenciana" },
]

interface EditForm {
  full_name: string
  dni: string
  position: string
  department: string
  contract_type: string
  contract_start: string
  contract_end: string
  region_code: string
}

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<EditForm>({
    full_name: "",
    dni: "",
    position: "",
    department: "",
    contract_type: "",
    contract_start: "",
    contract_end: "",
    region_code: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<UserProfile>("/workers/me")
      .then((res) => setProfile(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const openEdit = () => {
    if (!profile) return
    setForm({
      full_name: profile.full_name ?? "",
      dni: profile.dni ?? "",
      position: profile.position ?? "",
      department: profile.department ?? "",
      contract_type: profile.contract_type ?? "",
      contract_start: profile.contract_start ?? "",
      contract_end: profile.contract_end ?? "",
      region_code: profile.region_code ?? "",
    })
    setError(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, string | undefined> = {}
      if (form.full_name) payload.full_name = form.full_name
      if (form.dni) payload.dni = form.dni
      if (form.position) payload.position = form.position
      if (form.department) payload.department = form.department
      if (form.contract_type) payload.contract_type = form.contract_type
      if (form.contract_start) payload.contract_start = form.contract_start
      if (form.contract_end) payload.contract_end = form.contract_end
      if (form.region_code) payload.region_code = form.region_code

      const res = await api.put<UserProfile>(`/users/${profile.id}`, payload)
      setProfile(res.data)
      setDialogOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const setField = (key: keyof EditForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <User className="w-5 h-5" />
          Mi perfil
        </h1>
        <Button variant="outline" size="sm" onClick={openEdit} className="flex items-center gap-2">
          <Pencil className="w-4 h-4" />
          Editar perfil
        </Button>
      </div>

      {profile && <UserProfileCard profile={profile} />}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre completo</Label>
              <Input value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>DNI / NIF</Label>
              <Input value={form.dni} onChange={(e) => setField("dni", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Puesto / cargo</Label>
              <Input value={form.position} onChange={(e) => setField("position", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Input value={form.department} onChange={(e) => setField("department", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de contrato</Label>
              <Select value={form.contract_type} onValueChange={(v) => setField("contract_type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha inicio contrato</Label>
                <Input type="date" value={form.contract_start} onChange={(e) => setField("contract_start", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha fin contrato</Label>
                <Input type="date" value={form.contract_end} onChange={(e) => setField("contract_end", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Comunidad autónoma</Label>
              <Select value={form.region_code} onValueChange={(v) => setField("region_code", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {CCAA_OPTIONS.map((cc) => (
                    <SelectItem key={cc.value} value={cc.value}>{cc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
