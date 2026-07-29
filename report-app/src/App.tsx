import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import CssBaseline from "@mui/material/CssBaseline";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import SettingsIcon from "@mui/icons-material/Settings";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CompareView } from "./CompareView";
import { AccessibilityView } from "./AccessibilityView";
import { AdhocRunDialog } from "./AdhocRunDialog";
import { EditScreenDialog } from "./EditScreenDialog";
import { ApiSettingsDialog } from "./ApiSettingsDialog";
import { apiFetch, loadApiSettings, withApiBase, type ApiSettings } from "./apiConfig";
import type { ScreenReportEntry } from "./types";

const theme = createTheme({
  palette: {
    primary: { main: "#6c47ff" },
    background: { default: "#fafafa" },
  },
  shape: { borderRadius: 8 },
});

// 정적 리포트(HTML 단일 파일)는 window.__QA_REPORT_DATA__로 데이터가 주입되어 있다.
// 라이브 모드는 그게 없거나(로컬 qa:dev), 정적 리포트에서 토큰을 설정한 경우다.
const hasBakedData = typeof window !== "undefined" && window.__QA_REPORT_DATA__ !== undefined;

type ViewMode = "landing" | "report";
type EntriesSource = "config" | "adhoc";

const FEATURES = [
  {
    step: "01",
    title: "픽셀 단위 비교",
    description: "디자인 이미지와 실제 캡처 화면을 겹쳐보고 차이 영역을 하이라이트합니다.",
  },
  {
    step: "02",
    title: "웹 접근성 검사",
    description: "axe-core 기반으로 WCAG 2.1 A/AA 위반 사항을 자동으로 스캔합니다.",
  },
  {
    step: "03",
    title: "화면별 리포트",
    description: "화면마다 PASS/FAIL과 diff 비율을 한눈에 확인할 수 있습니다.",
  },
] as const;

export function App() {
  const [entries, setEntries] = useState<ScreenReportEntry[]>(() => window.__QA_REPORT_DATA__ ?? []);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [refreshingName, setRefreshingName] = useState<string | null>(null);
  const [entriesSource, setEntriesSource] = useState<EntriesSource>("config");
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ScreenReportEntry | null>(null);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => loadApiSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  // URL로 접속하면 항상 첫 화면(랜딩)부터 보여준다. 이전 결과는 "이전 결과 보기" 버튼으로 이동.
  const [viewMode, setViewMode] = useState<ViewMode>("landing");

  const isLiveMode = !hasBakedData || Boolean(apiSettings.token);

  function goToLanding() {
    setViewMode("landing");
  }

  function goToReport() {
    setViewMode("report");
  }

  useEffect(() => {
    if (!isLiveMode) return;
    apiFetch("/api/latest")
      .then((res) => res.json())
      .then((data: { entries: ScreenReportEntry[]; source?: EntriesSource }) => {
        setEntries(withApiBase(data.entries));
        setEntriesSource(data.source ?? "config");
      })
      .catch(() => {
        // 초기 로드 실패는 조용히 무시하고 "실행" 버튼으로 유도한다.
      });
  }, [isLiveMode, apiSettings.token]);

  async function refreshEntry(name: string) {
    setRefreshingName(name);
    setError(null);
    try {
      const res = await apiFetch(`/api/refresh?name=${encodeURIComponent(name)}`, { method: "POST" });
      const data = (await res.json()) as { entry?: ScreenReportEntry; error?: string };
      if (!res.ok || !data.entry) throw new Error(data.error ?? "새로고침에 실패했습니다.");
      const updated = withApiBase([data.entry])[0];
      setEntries((prev) => prev.map((e) => (e.name === name ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingName(null);
    }
  }

  function handleAdhocSuccess(newEntries: ScreenReportEntry[]) {
    setEntries(newEntries);
    setEntriesSource("adhoc");
    setSelected(0);
    goToReport();
  }

  function handleEditSuccess(updated: ScreenReportEntry) {
    setEntries((prev) => prev.map((e) => (e.name === updated.name ? updated : e)));
    setEditEntry(null);
  }

  const adhocDialog = isLiveMode && (
    <AdhocRunDialog open={adhocOpen} onClose={() => setAdhocOpen(false)} onSuccess={handleAdhocSuccess} />
  );

  const editDialog = isLiveMode && (
    <EditScreenDialog
      open={Boolean(editEntry)}
      entry={editEntry}
      onClose={() => setEditEntry(null)}
      onSuccess={handleEditSuccess}
    />
  );

  const adhocButton = isLiveMode && (
    <Tooltip title="직접입력 QA 실행">
      <IconButton size="small" disabled={loading} onClick={() => setAdhocOpen(true)}>
        <AddCircleOutlineIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  const settingsButton = (
    <Tooltip title="원격 QA 백엔드 연결 설정">
      <IconButton size="small" onClick={() => setSettingsOpen(true)}>
        <SettingsIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  const settingsDialog = (
    <ApiSettingsDialog
      open={settingsOpen}
      settings={apiSettings}
      onClose={() => setSettingsOpen(false)}
      onSave={(next) => {
        setApiSettings(next);
        setSettingsOpen(false);
      }}
    />
  );

  if (viewMode === "landing" || entries.length === 0) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            position: "relative",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 4,
            background: "linear-gradient(180deg, #f5f3ff 0%, #fafafa 260px)",
          }}
        >
          <Stack direction="row" spacing={1} sx={{ position: "absolute", top: 16, right: 16 }}>
            {entries.length > 0 && (
              <Button size="small" variant="text" onClick={goToReport}>
                이전 결과 보기
              </Button>
            )}
            {settingsButton}
          </Stack>
          <Box sx={{ maxWidth: 760, width: "100%", textAlign: "center" }}>
            <Chip
              label="Design ↔ Publishing QA"
              size="small"
              sx={{ mb: 2, bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 600 }}
            />
            <Typography variant="h4" fontWeight={800} sx={{ mb: 1.5 }}>
              디자인 vs 퍼블리싱 QA
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
              디자인 시안과 실제 퍼블리싱 결과물을 픽셀 단위로 비교하고,
              <br />웹 접근성(WCAG)까지 자동으로 검사해 리포트로 보여줍니다.
            </Typography>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ mb: 5, textAlign: "left" }}
            >
              {FEATURES.map((f) => (
                <Box
                  key={f.title}
                  sx={{
                    flex: 1,
                    p: 2.5,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                  }}
                >
                  <Typography variant="caption" color="primary.main" fontWeight={700}>
                    {f.step}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5, mb: 0.5 }}>
                    {f.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {f.description}
                  </Typography>
                </Box>
              ))}
            </Stack>

            {isLiveMode ? (
              <>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center">
                  <Button
                    size="large"
                    variant="contained"
                    disabled={loading}
                    onClick={() => setAdhocOpen(true)}
                    sx={{ px: 5, py: 1.25, fontWeight: 700 }}
                  >
                    직접입력 QA 실행
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                  baseUrl·이미지·경로를 직접 입력해서 한 화면만 실행할 수 있습니다.
                </Typography>
              </>
            ) : (
              <Typography color="text.secondary">표시할 리포트 데이터가 없습니다.</Typography>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 3, textAlign: "left" }}>
                {error}
              </Alert>
            )}
          </Box>
        </Box>
        {adhocDialog}
        {settingsDialog}
      </ThemeProvider>
    );
  }

  const passCount = entries.filter((e) => e.pass).length;
  const failCount = entries.length - passCount;
  const entry = entries[selected];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh" }}>
        <Box
          sx={{
            width: 300,
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "grey.50",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle1" fontWeight={700}>
                디자인 vs 퍼블리싱 QA
              </Typography>
              <Stack direction="row">
                {adhocButton}
                <Tooltip title="실행 전 처음 화면으로">
                  <IconButton size="small" onClick={goToLanding}>
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {settingsButton}
              </Stack>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip size="small" label={`총 ${entries.length}`} />
              <Chip size="small" color="success" label={`PASS ${passCount}`} />
              <Chip size="small" color="error" label={`FAIL ${failCount}`} />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              diff 10% 미만이면 PASS
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {error}
              </Alert>
            )}
          </Box>
          <List sx={{ overflowY: "auto", flex: 1, p: 1 }}>
            {entries.map((e, i) => (
              <ListItem
                key={e.name}
                disablePadding
                sx={{ mb: 0.5 }}
                secondaryAction={
                  isLiveMode && (
                    <Stack direction="row" spacing={0.5}>
                      {entriesSource === "adhoc" && (
                        <Tooltip title="입력 값 수정 후 재실행">
                          <span>
                            <IconButton
                              edge="end"
                              size="small"
                              disabled={refreshingName === e.name || loading}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEditEntry(e);
                              }}
                              sx={{
                                color: i === selected ? "primary.contrastText" : "text.secondary",
                                "&.Mui-disabled": {
                                  color: i === selected ? "primary.contrastText" : undefined,
                                  opacity: i === selected ? 0.6 : undefined,
                                },
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="이 화면만 새로고침">
                        <span>
                          <IconButton
                            edge="end"
                            size="small"
                            disabled={refreshingName === e.name || loading}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void refreshEntry(e.name);
                            }}
                            sx={{
                              color: i === selected ? "primary.contrastText" : "text.secondary",
                              "&.Mui-disabled": {
                                color: i === selected ? "primary.contrastText" : undefined,
                                opacity: i === selected ? 0.6 : undefined,
                              },
                            }}
                          >
                            {refreshingName === e.name ? (
                              <CircularProgress size={14} color="inherit" />
                            ) : (
                              <RefreshIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  )
                }
              >
                <ListItemButton
                  selected={i === selected}
                  onClick={() => setSelected(i)}
                  sx={{
                    borderRadius: 1,
                    alignItems: "flex-start",
                    pr: isLiveMode ? (entriesSource === "adhoc" ? 9 : 5) : undefined,
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { bgcolor: "primary.dark" },
                    },
                  }}
                >
                  <Box sx={{ position: "relative", mr: 1.5, flexShrink: 0 }}>
                    <Box
                      component="img"
                      src={e.designRelPath}
                      sx={{
                        width: 56,
                        height: 36,
                        display: "block",
                        objectFit: "cover",
                        objectPosition: "top",
                        borderRadius: 0.5,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                      }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        top: -3,
                        left: -3,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: e.pass ? "success.main" : "error.main",
                        border: "1.5px solid",
                        borderColor: "background.paper",
                      }}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {e.name}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography
                        variant="caption"
                        sx={{ opacity: i === selected ? 0.85 : undefined }}
                        color={i === selected ? "inherit" : "text.secondary"}
                      >
                        diff {e.result.diffPercentage.toFixed(2)}%
                      </Typography>
                      {e.accessibility?.failed && (
                        <Tooltip title="접근성 위반(critical+serious) 개수">
                          <Typography
                            component="span"
                            variant="caption"
                            fontWeight={700}
                            color={i === selected ? "inherit" : "warning.main"}
                            sx={{ opacity: i === selected ? 0.85 : undefined }}
                          >
                            ({a11yFailCount(e.accessibility)})
                          </Typography>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="h6">{entry.name}</Typography>
            <Chip
              size="small"
              color={entry.pass ? "success" : "error"}
              label={entry.pass ? "PASS" : "FAIL"}
            />
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              diff {entry.result.diffPercentage.toFixed(3)}% ({entry.result.diffPixelCount}/{entry.result.totalPixels}px)
              {entry.result.dimensionMismatch ? " — 크기 불일치" : ""}
            </Typography>
            <Tooltip title={showDiff ? "차이 영역 숨기기" : "차이 영역 표시"}>
              <span style={{ marginLeft: 10 }}>
                <IconButton
                  size="small"
                  color={showDiff ? "primary" : "default"}
                  onClick={() => setShowDiff((prev) => !prev)}
                  disabled={entry.result.regions.length === 0}
                >
                  {showDiff ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          <CompareView key={entry.name} entry={entry} showDiff={showDiff} />

          <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>
            접근성
          </Typography>
          <AccessibilityView accessibility={entry.accessibility} />
        </Box>
      </Box>
      {adhocDialog}
      {editDialog}
      {settingsDialog}
    </ThemeProvider>
  );
}

function a11yFailCount(accessibility: { countsBySeverity: { critical: number; serious: number } }): number {
  return accessibility.countsBySeverity.critical + accessibility.countsBySeverity.serious;
}
