import { useState } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CompareView } from "./CompareView";

const theme = createTheme();

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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ flexDirection: "column", alignItems: "flex-start", py: 1 }}>
          <Typography variant="h6">디자인 vs 퍼블리싱 QA 리포트</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Chip size="small" label={`총 ${entries.length}개`} />
            <Chip size="small" color="success" label={`PASS ${passCount}`} />
            <Chip size="small" color="error" label={`FAIL ${failCount}`} />
          </Stack>
        </Toolbar>
        <Tabs
          value={selected}
          onChange={(_, v: number) => setSelected(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {entries.map((e, i) => (
            <Tab
              key={e.name}
              value={i}
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: e.pass ? "success.main" : "error.main",
                    }}
                  />
                  <span>{e.name}</span>
                </Stack>
              }
            />
          ))}
        </Tabs>
      </AppBar>
      <Box sx={{ p: 3 }}>
        <CompareView entry={entries[selected]} />
      </Box>
    </ThemeProvider>
  );
}
