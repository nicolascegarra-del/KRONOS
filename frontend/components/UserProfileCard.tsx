"use client"

import { User } from "lucide-react"

const CCAA_NAMES: Record<string, string> = {
  "ES-AN": "Andalucía", "ES-AR": "Aragón", "ES-AS": "Asturias",
  "ES-IB": "Illes Balears", "ES-CN": "Canarias", "ES-CB": "Cantabria",
  "ES-CL": "Castilla y León", "ES-CM": "Castilla-La Mancha",
  "ES-CT": "Cataluña", "ES-EX": "Extremadura", "ES-GA": "Galicia",
  "ES-RI": "La Rioja", "ES-MD": "Madrid", "ES-MC": "Murcia",
  "ES-NC": "Navarra", "ES-PV": "País Vasco", "ES-VC": "C. Valenciana",
}

export interface UserProfile {
  id: string
  full_name: string
  email: string
  role: string
  scheduled_start?: string
  scheduled_end?: string
  company_id?: string
  dni?: string
  position?: string
  department?: string
  region_code?: string
  vacation_days?: number
}

interface Field {
  label: string
  value: string | undefined
}

interface Props {
  profile: UserProfile
  /** Si true muestra mensaje "Para modificar, contacta con tu administrador" */
  readonlyHint?: boolean
}

export default function UserProfileCard({ profile, readonlyHint = false }: Props) {
  const fields: Field[] = [
    { label: "Nombre completo", value: profile.full_name },
    { label: "Email", value: profile.email },
    { label: "DNI / NIF", value: profile.dni },
    { label: "Puesto / cargo", value: profile.position },
    { label: "Departamento", value: profile.department },
    {
      label: "Comunidad autónoma",
      value: profile.region_code
        ? (CCAA_NAMES[profile.region_code] ?? profile.region_code)
        : undefined,
    },
  ].filter((f) => f.value)

  return (
    <div className="bg-white border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2 border-b pb-2">
        <User className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Mi ficha</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <span className="block text-xs font-medium text-slate-500">{label}</span>
            <span className="text-sm font-medium text-slate-800">{value}</span>
          </div>
        ))}
      </div>

      {readonlyHint && (
        <p className="text-xs text-muted-foreground pt-1 border-t">
          Para modificar tus datos, contacta con tu administrador.
        </p>
      )}
    </div>
  )
}
