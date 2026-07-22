import { useState } from "react";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CompareView } from "./CompareView";
import { AccessibilityView } from "./AccessibilityView";

const theme = createTheme({
  palette: {
    primary: { main: "#6c47ff" },
    background: { default: "#fafafa" },
  },
  shape: { borderRadius: 8 },
});

export function App() {
  const entries = window.__QA_REPORT_DATA__ ?? [];
  const [selected, setSelected] = useState(0);

  if (entries.length === 0) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ p: 4 }}>
          <Typography>표시할 리포트 데이터가 없습니다.</Typography>
        </Box>
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
            <Typography variant="subtitle1" fontWeight={700}>
              디자인 vs 퍼블리싱 QA
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip size="small" label={`총 ${entries.length}`} />
              <Chip size="small" color="success" label={`PASS ${passCount}`} />
              <Chip size="small" color="error" label={`FAIL ${failCount}`} />
            </Stack>
          </Box>
          <List sx={{ overflowY: "auto", flex: 1, p: 1 }}>
            {entries.map((e, i) => (
              <ListItemButton
                key={e.name}
                selected={i === selected}
                onClick={() => setSelected(i)}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  alignItems: "flex-start",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                <Box
                  component="img"
                  src={e.designRelPath}
                  sx={{
                    width: 56,
                    height: 36,
                    objectFit: "cover",
                    objectPosition: "top",
                    borderRadius: 0.5,
                    border: "1px solid",
                    borderColor: "divider",
                    mr: 1.5,
                    flexShrink: 0,
                    bgcolor: "background.paper",
                  }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {e.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ opacity: i === selected ? 0.85 : undefined }}
                    color={i === selected ? "inherit" : "text.secondary"}
                  >
                    diff {e.result.diffPercentage.toFixed(2)}%
                  </Typography>
                </Box>
                {e.accessibility?.failed && (
                  <Chip
                    size="small"
                    color="warning"
                    label={a11yFailCount(e.accessibility)}
                    sx={{ height: 18, minWidth: 18, fontSize: 11, mt: 0.5, ml: 1 }}
                    title="접근성 위반(critical+serious) 개수"
                  />
                )}
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: e.pass ? "success.main" : "error.main",
                    mt: 0.75,
                    ml: 1,
                    flexShrink: 0,
                  }}
                />
              </ListItemButton>
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            diff {entry.result.diffPercentage.toFixed(3)}% ({entry.result.diffPixelCount}/{entry.result.totalPixels}px)
            {entry.result.dimensionMismatch ? " — 크기 불일치" : ""}
          </Typography>
          <CompareView entry={entry} />

          <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>
            접근성
          </Typography>
          <AccessibilityView accessibility={entry.accessibility} />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function a11yFailCount(accessibility: { countsBySeverity: { critical: number; serious: number } }): number {
  return accessibility.countsBySeverity.critical + accessibility.countsBySeverity.serious;
}
