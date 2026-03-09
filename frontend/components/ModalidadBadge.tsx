export function ModalidadBadge({ modalidad }: { modalidad?: string }) {
  if (modalidad === "teletrabajo") {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        Teletrabajo
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      Presencial
    </span>
  );
}
