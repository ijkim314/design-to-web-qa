import type { ScreenReportEntry } from "./types";

const STORAGE_KEY = "qa-api-settings-v1";

// A, B 등 모든 사용자가 동일한 공유 백엔드를 바라보므로 URL은 비밀정보가 아니다.
// 토큰만 사용자가 직접 입력해야 한다 (공개 빌드 산출물에 포함되면 안 되는 값이므로).
export const DEFAULT_API_BASE = "https://design-to-web-qa-backend.onrender.com";

export interface ApiSettings {
  apiBase: string;
  token: string;
}

const EMPTY_SETTINGS: ApiSettings = { apiBase: DEFAULT_API_BASE, token: "" };

export function loadApiSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    // apiBase는 사용자 입력을 받지 않는 고정값이다 (토큰 탈취 방지, DEFAULT_API_BASE 참고).
    return { apiBase: DEFAULT_API_BASE, token: parsed.token?.trim() ?? "" };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export function saveApiSettings(settings: ApiSettings): void {
  const normalized: ApiSettings = {
    apiBase: DEFAULT_API_BASE,
    token: settings.token.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

const SESSION_KEY = "qa-session-id-v1";

// 탭(sessionStorage)마다 고유 ID를 부여해 여러 사용자가 동시에 접속해도
// 백엔드에서 서로의 실행 결과를 분리해서 관리할 수 있게 한다.
function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { apiBase, token } = loadApiSettings();
  const headers = new Headers(init?.headers);
  if (token) headers.set("X-QA-Token", token);
  headers.set("X-QA-Session", getSessionId());
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
