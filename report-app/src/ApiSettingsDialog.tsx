import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DEFAULT_API_BASE, saveApiSettings, type ApiSettings } from "./apiConfig";

interface ApiSettingsDialogProps {
  open: boolean;
  settings: ApiSettings;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
}

export function ApiSettingsDialog({ open, settings, onClose, onSave }: ApiSettingsDialogProps) {
  const [token, setToken] = useState(settings.token);

  useEffect(() => {
    if (open) {
      setToken(settings.token);
    }
  }, [open, settings]);

  function handleSave() {
    const next: ApiSettings = { apiBase: DEFAULT_API_BASE, token };
    saveApiSettings(next);
    onSave(next);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>QA 백엔드 연결 설정</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            정적 리포트에서 "QA 실행" 버튼을 동작시키려면, 토큰을 입력하세요.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            백엔드: {DEFAULT_API_BASE}
          </Typography>
          <TextField
            label="토큰"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            fullWidth
            size="small"
            type="password"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={handleSave}>
          저장
        </Button>
      </DialogActions>
    </Dialog>
  );
}
