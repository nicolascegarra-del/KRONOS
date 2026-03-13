"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface ScheduleDay {
  schedule_date: string
  start_time: string | null
  end_time: string | null
}

export default function TurnosPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [days, setDays] = useState<ScheduleDay[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (y: number, m: number) => {
    setLoading(true)
    try {
      const res = await api.get("/workers/me/schedule", { params: { year: y, month: m } })
      setDays(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(year, month) }, [year, month])

  const scheduleMap = new Map<string, ScheduleDay>()
  for (const d of days) scheduleMap.set(d.schedule_date, d)

  const totalMinutes = days.reduce((acc, d) => {
    if (!d.start_time || !d.end_time) return acc
    const [sh, sm] = d.start_time.split(":").map(Number)
    const [eh, em] = d.end_time.split(":").map(Number)
    return acc + (eh * 60 + em) - (sh * 60 + sm)
  }, 0)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalMins = totalMinutes % 60

  const navigate = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Mi cuadrante</h1>

      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-accent text-lg">‹</button>
        <span className="font-semibold capitalize">
          {new Date(year, month - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-accent text-lg">›</button>
      </div>

      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {["L","M","X","J","V","S","D"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
              const sched = scheduleMap.get(dateStr)
              const isToday = dateStr === today.toISOString().slice(0, 10)
              return (
                <div
                  key={dateStr}
                  className={[
                    "rounded p-1 text-xs min-h-[3rem] flex flex-col items-center justify-start border",
                    sched ? "bg-primary/10 text-primary border-transparent" : "bg-slate-50 border-transparent",
                    isToday ? "ring-2 ring-primary ring-offset-1" : "",
                  ].join(" ")}
                >
                  <span className="font-medium">{day}</span>
                  {sched?.start_time && sched?.end_time && (
                    <span className="text-[10px] leading-tight text-center">
                      {sched.start_time.slice(0,5)}–{sched.end_time.slice(0,5)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Total mes: <strong>{totalHours}h {totalMins > 0 ? `${totalMins}min` : ""}</strong>
          </p>
        </>
      )}
    </div>
  )
}
