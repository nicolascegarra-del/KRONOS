"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface GeoWorker {
  user_id: string;
  full_name: string;
  lat: number;
  lng: number;
  status: "active" | "paused" | "ended";
  label: string; // formatted time string
}

function makeIcon(status: GeoWorker["status"]) {
  const color =
    status === "active" ? "#22c55e" : status === "paused" ? "#f59e0b" : "#94a3b8";
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

const STATUS_LABEL: Record<GeoWorker["status"], string> = {
  active: "🟢 Fichando",
  paused: "🟡 En pausa",
  ended: "⚪ Finalizado hoy",
};

export default function WorkerGeoMap({ workers }: { workers: GeoWorker[] }) {
  if (workers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Sin datos de geolocalización disponibles hoy
      </div>
    );
  }

  const avgLat = workers.reduce((s, w) => s + w.lat, 0) / workers.length;
  const avgLng = workers.reduce((s, w) => s + w.lng, 0) / workers.length;

  return (
    <MapContainer
      center={[avgLat, avgLng]}
      zoom={13}
      style={{ height: "320px", width: "100%", borderRadius: "8px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {workers.map((w) => (
        <Marker key={w.user_id} position={[w.lat, w.lng]} icon={makeIcon(w.status)}>
          <Popup>
            <div className="text-sm leading-5">
              <strong>{w.full_name}</strong>
              <div>{STATUS_LABEL[w.status]}</div>
              <div className="text-xs text-gray-500">{w.label}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
