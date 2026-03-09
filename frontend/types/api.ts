// Shared API types — import from here instead of redefining per page

export interface PausaAdmin {
  id: string;
  start_time: string;
  end_time?: string;
  comment: string;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
}

export interface UserBasic {
  id: string;
  email: string;
  full_name: string;
}

export interface FichajeAdmin {
  id: string;
  user_id: string;
  user?: UserBasic;
  start_time: string;
  end_time?: string;
  status: "active" | "paused" | "finished";
  total_minutes?: number;
  late_minutes?: number;
  modalidad?: string;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
  out_of_range?: boolean;
  rest_violation?: boolean;
  edit_comment?: string;
  pausas: PausaAdmin[];
}
