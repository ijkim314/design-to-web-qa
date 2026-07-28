import type { ScreenReportEntry } from "./types";

const STORAGE_KEY = "qa-api-settings-v1";

export interface ApiSettings {
  apiBase: string;
  token: string;
}

const EMPTY_SETTINGS: ApiSettings = { apiBase: "", token: "" };

export function loadApiSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    return { apiBase: parsed.apiBase?.trim() ?? "", token: parsed.token?.trim() ?? "" };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export function saveApiSettings(settings: ApiSettings): void {
  const normalized: ApiSettings = {
    apiBase: settings.apiBase.trim().replace(/\/+$/, ""),
    token: settings.token.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { apiBase, token } = loadApiSettings();
  const headers = new Headers(init?.headers);
  if (token) headers.set("X-QA-Token", token);
  return fetch(`${apiBase}${path}`, { ...init, headers });
}

export function withApiBase(entries: ScreenReportEntry[]): ScreenReportEntry[] {
  const { apiBase } = loadApiSettings();
  if (!apiBase) return entries;
  return entries.map((e) => ({
    ...e,
    designRelPath: `${apiBase}${e.designRelPath}`,
    captureRelPath: `${apiBase}${e.captureRelPath}`,
    diffRelPath: `${apiBase}${e.diffRelPath}`,
  }));
}
