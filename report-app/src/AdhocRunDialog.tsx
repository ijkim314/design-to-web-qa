import { useEffect, useRef, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { ScreenReportEntry } from "./types";
import { apiFetch, withApiBase } from "./apiConfig";
import { readImagePixelSize } from "./imageUtils";

interface AdhocRunDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (entries: ScreenReportEntry[]) => void;
}

interface ScreenRow {
  id: string;
  name: string;
  path: string;
  file: File | null;
  width: string;
  height: string;
  deviceScaleFactor: string;
  fullPage: boolean;
  accessibility: boolean;
}

function newRow(): ScreenRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    path: "",
    file: null,
    width: "",
    height: "",
    deviceScaleFactor: "1",
    fullPage: true,
    accessibility: true,
  };
}

const STORAGE_KEY = "qa-adhoc-run-form-v2";

type StoredRow = Omit<ScreenRow, "file">;
interface StoredForm {
  baseUrl: string;
  rows: StoredRow[];
}

function loadStoredForm(): StoredForm | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredForm;
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredForm(baseUrl: string, rows: ScreenRow[]): void {
  try {
    const stored: StoredForm = {
      baseUrl,
      rows: rows.map(({ file: _file, ...rest }) => rest),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage를 쓸 수 없는 환경이면 조용히 무시 (값 기억 기능만 비활성화됨)
  }
}

function initialRows(): ScreenRow[] {
  const stored = loadStoredForm();
  if (!stored) return [newRow()];
  return stored.rows.map((row) => ({ ...row, id: row.id || crypto.randomUUID(), file: null }));
}

// 업로드한 이미지(File)는 브라우저 보안 정책상 localStorage에 담을 수 없어 IndexedDB에 별도 보관한다.
const IMAGE_DB_NAME = "qa-adhoc-images";
const IMAGE_STORE_NAME = "images";

function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMAGE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        req.result.createObjectStore(IMAGE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB를 열 수 없습니다."));
  });
}

async function saveImageFile(id: string, file: File): Promise<void> {
  try {
    const db = await openImageDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE_NAME, "readwrite");
      tx.objectStore(IMAGE_STORE_NAME).put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB를 쓸 수 없는 환경이면 이미지 기억 기능만 비활성화됨
  }
}

async function loadImageFile(id: string): Promise<File | null> {
  try {
    const db = await openImageDb();
    const file = await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE_NAME, "readonly");
      const req = tx.objectStore(IMAGE_STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as File | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch {
    return null;
  }
}

async function deleteImageFile(id: string): Promise<void> {
  try {
    const db = await openImageDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE_NAME, "readwrite");
      tx.objectStore(IMAGE_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("이미지를 읽는 데 실패했습니다."));
    reader.readAsDataURL(file);
  });
}

export function AdhocRunDialog({ open, onClose, onSuccess }: AdhocRunDialogProps) {
  const [baseUrl, setBaseUrl] = useState(() => loadStoredForm()?.baseUrl ?? "");
  const [rows, setRows] = useState<ScreenRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagesHydrated, setImagesHydrated] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    saveStoredForm(baseUrl, rows);
  }, [baseUrl, rows]);

  // 페이지가 처음 열릴 때, 이전에 업로드했던 이미지를 IndexedDB에서 한 번 복원한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = rows;
      await Promise.all(
        initial.map(async (row) => {
          if (row.file) return;
          const file = await loadImageFile(row.id);
          if (file && !cancelled) updateRow(row.id, { file });
        })
      );
      if (!cancelled) setImagesHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearForm() {
    rows.forEach((row) => void deleteImageFile(row.id));
    setBaseUrl("");
    setRows([newRow()]);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  function updateRow(id: string, patch: Partial<ScreenRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function setRowFile(id: string, file: File | null) {
    updateRow(id, { file });
    if (file) {
      void saveImageFile(id, file);
      // 업로드한 디자인 이미지의 실제 픽셀 크기를 뷰포트 가로/세로에 자동으로 채워준다.
      void readImagePixelSize(file)
        .then(({ width, height }) => updateRow(id, { width: String(width), height: String(height) }))
        .catch(() => {});
    } else {
      void deleteImageFile(id);
    }
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
    void deleteImageFile(id);
  }

  async function handleSubmit() {
    if (!baseUrl.trim()) {
      setError("baseUrl을 입력하세요.");
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.path.trim()) {
        setError(`${i + 1}번째 화면의 상세 경로를 입력하세요.`);
        return;
      }
      if (!row.file) {
        setError(`${i + 1}번째 화면의 디자인 이미지를 업로드하세요.`);
        return;
      }
      const widthFilled = Boolean(row.width.trim());
      const heightFilled = Boolean(row.height.trim());
      if (widthFilled !== heightFilled) {
        setError(`${i + 1}번째 화면: 뷰포트는 가로와 세로를 모두 입력해야 합니다.`);
        return;
      }
      if (widthFilled && heightFilled && (!(Number(row.width) > 0) || !(Number(row.height) > 0))) {
        setError(`${i + 1}번째 화면: 가로/세로는 0보다 큰 값을 입력하세요.`);
        return;
      }
      if (row.deviceScaleFactor.trim() && !(Number(row.deviceScaleFactor) > 0)) {
        setError(`${i + 1}번째 화면: 배율은 0보다 큰 값을 입력하세요.`);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const screens = await Promise.all(
        rows.map(async (row) => ({
          name: row.name.trim() || undefined,
          path: row.path.trim(),
          imageBase64: await readFileAsBase64(row.file as File),
          viewport:
            row.width.trim() && row.height.trim()
              ? {
                  width: Number(row.width),
                  height: Number(row.height),
                  deviceScaleFactor: row.deviceScaleFactor.trim() ? Number(row.deviceScaleFactor) : 1,
                }
              : undefined,
          fullPage: row.fullPage,
          accessibility: row.accessibility,
        }))
      );
      const res = await apiFetch("/api/run-adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), screens }),
      });
      const data = (await res.json()) as { entries?: ScreenReportEntry[]; error?: string };
      if (!res.ok || !data.entries) throw new Error(data.error ?? "실행에 실패했습니다.");
      onSuccess(withApiBase(data.entries));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>직접 입력해서 QA 실행</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="baseUrl"
            placeholder="https://example.com/"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            fullWidth
            size="small"
            disabled={loading}
          />

          {rows.map((row, i) => (
            <Box key={row.id}>
              {i > 0 && <Divider sx={{ mb: 2 }} />}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  화면 {i + 1}
                </Typography>
                <IconButton size="small" onClick={() => removeRow(row.id)} disabled={loading || rows.length <= 1}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Stack spacing={1.5}>
                <TextField
                  label="상세 경로"
                  placeholder="/blog/html/design-to-web/example/page.html"
                  value={row.path}
                  onChange={(e) => updateRow(row.id, { path: e.target.value })}
                  fullWidth
                  size="small"
                  disabled={loading}
                />
                <TextField
                  label="화면 이름 (선택)"
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  fullWidth
                  size="small"
                  disabled={loading}
                />
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="가로"
                    placeholder="예: 393"
                    type="number"
                    value={row.width}
                    onChange={(e) => updateRow(row.id, { width: e.target.value })}
                    size="small"
                    disabled={loading}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="세로"
                    placeholder="예: 852"
                    type="number"
                    value={row.height}
                    onChange={(e) => updateRow(row.id, { height: e.target.value })}
                    size="small"
                    disabled={loading}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="배율"
                    placeholder="예: 1"
                    type="number"
                    value={row.deviceScaleFactor}
                    onChange={(e) => updateRow(row.id, { deviceScaleFactor: e.target.value })}
                    size="small"
                    disabled={loading}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  가로/세로를 비워두면 qa.config.json의 기본 뷰포트를 사용합니다. 배율은 기본 1입니다.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={row.fullPage}
                        onChange={(e) => updateRow(row.id, { fullPage: e.target.checked })}
                        disabled={loading}
                      />
                    }
                    label="전체 페이지 캡처"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={row.accessibility}
                        onChange={(e) => updateRow(row.id, { accessibility: e.target.checked })}
                        disabled={loading}
                      />
                    }
                    label="접근성 검사"
                  />
                </Stack>
                <Box>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[row.id] = el;
                    }}
                    type="file"
                    accept="image/png"
                    hidden
                    onChange={(e) => setRowFile(row.id, e.target.files?.[0] ?? null)}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<UploadFileIcon fontSize="small" />}
                    onClick={() => fileInputRefs.current[row.id]?.click()}
                    disabled={loading}
                  >
                    디자인 이미지 업로드 (PNG)
                  </Button>
                  {row.file ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      {row.file.name}
                    </Typography>
                  ) : (
                    row.path.trim() &&
                    (imagesHydrated ? (
                      <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.5 }}>
                        이전에 업로드한 이미지를 찾을 수 없습니다. 다시 선택해주세요.
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        이미지를 불러오는 중...
                      </Typography>
                    ))
                  )}
                </Box>
              </Stack>
            </Box>
          ))}

          <Button size="small" startIcon={<AddIcon fontSize="small" />} onClick={addRow} disabled={loading} sx={{ alignSelf: "flex-start" }}>
            화면 추가
          </Button>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={clearForm} disabled={loading} color="inherit" sx={{ mr: "auto" }}>
          초기화
        </Button>
        <Button onClick={onClose} disabled={loading}>
          취소
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {loading ? "실행 중..." : `실행 (${rows.length}개 화면)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
