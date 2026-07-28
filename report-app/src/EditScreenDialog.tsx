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
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import type { ScreenReportEntry } from "./types";
import { apiFetch, withApiBase } from "./apiConfig";

interface EditScreenDialogProps {
  open: boolean;
  entry: ScreenReportEntry | null;
  onClose: () => void;
  onSuccess: (entry: ScreenReportEntry) => void;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("이미지를 읽는 데 실패했습니다."));
    reader.readAsDataURL(file);
  });
}

export function EditScreenDialog({ open, entry, onClose, onSuccess }: EditScreenDialogProps) {
  const [screenPath, setScreenPath] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [deviceScaleFactor, setDeviceScaleFactor] = useState("1");
  const [fullPage, setFullPage] = useState(true);
  const [accessibility, setAccessibility] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!entry) return;
    const input = entry.input;
    setScreenPath(input?.path ?? "");
    setWidth(input?.viewport ? String(input.viewport.width) : "");
    setHeight(input?.viewport ? String(input.viewport.height) : "");
    setDeviceScaleFactor(input?.viewport ? String(input.viewport.deviceScaleFactor) : "1");
    setFullPage(input?.fullPage ?? true);
    setAccessibility(input?.accessibility ?? true);
    setFile(null);
    setError(null);
  }, [entry]);

  async function handleSubmit() {
    if (!entry) return;
    if (!screenPath.trim()) {
      setError("상세 경로를 입력하세요.");
      return;
    }
    const widthFilled = Boolean(width.trim());
    const heightFilled = Boolean(height.trim());
    if (widthFilled !== heightFilled) {
      setError("뷰포트는 가로와 세로를 모두 입력해야 합니다.");
      return;
    }
    if (widthFilled && heightFilled && (!(Number(width) > 0) || !(Number(height) > 0))) {
      setError("가로/세로는 0보다 큰 값을 입력하세요.");
      return;
    }
    if (deviceScaleFactor.trim() && !(Number(deviceScaleFactor) > 0)) {
      setError("배율은 0보다 큰 값을 입력하세요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body = {
        path: screenPath.trim(),
        imageBase64: file ? await readFileAsBase64(file) : undefined,
        viewport:
          widthFilled && heightFilled
            ? {
                width: Number(width),
                height: Number(height),
                deviceScaleFactor: deviceScaleFactor.trim() ? Number(deviceScaleFactor) : 1,
              }
            : undefined,
        fullPage,
        accessibility,
      };
      const res = await apiFetch(`/api/update-screen?name=${encodeURIComponent(entry.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { entry?: ScreenReportEntry; error?: string };
      if (!res.ok || !data.entry) throw new Error(data.error ?? "수정에 실패했습니다.");
      onSuccess(withApiBase([data.entry])[0]);
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
      <DialogTitle>{entry?.name} 값 수정</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField
            label="상세 경로"
            placeholder="/blog/html/design-to-web/example/page.html"
            value={screenPath}
            onChange={(e) => setScreenPath(e.target.value)}
            fullWidth
            size="small"
            disabled={loading}
          />
          <Stack direction="row" spacing={1}>
            <TextField
              label="가로"
              placeholder="예: 393"
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              size="small"
              disabled={loading}
              sx={{ flex: 1 }}
            />
            <TextField
              label="세로"
              placeholder="예: 852"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              size="small"
              disabled={loading}
              sx={{ flex: 1 }}
            />
            <TextField
              label="배율"
              placeholder="예: 1"
              type="number"
              value={deviceScaleFactor}
              onChange={(e) => setDeviceScaleFactor(e.target.value)}
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
                  checked={fullPage}
                  onChange={(e) => setFullPage(e.target.checked)}
                  disabled={loading}
                />
              }
              label="전체 페이지 캡처"
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={accessibility}
                  onChange={(e) => setAccessibility(e.target.checked)}
                  disabled={loading}
                />
              }
              label="접근성 검사"
            />
          </Stack>
          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadFileIcon fontSize="small" />}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              디자인 이미지 재업로드 (PNG)
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {file ? file.name : "선택하지 않으면 기존 디자인 이미지를 그대로 사용합니다."}
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          취소
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {loading ? "실행 중..." : "수정 후 재실행"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
