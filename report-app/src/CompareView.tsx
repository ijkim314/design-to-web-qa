import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Slider from "@mui/material/Slider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { DiffRegion, ScreenReportEntry } from "./types";
import { RegionOverlay } from "./RegionOverlay";

type ViewMode = "overlay" | "side-by-side";

export function CompareView({ entry }: { entry: ScreenReportEntry }) {
  const [mode, setMode] = useState<ViewMode>("overlay");
  const [sliderValue, setSliderValue] = useState(50);
  const { result } = entry;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          diff {result.diffPercentage.toFixed(3)}% ({result.diffPixelCount}/{result.totalPixels}px)
          {result.dimensionMismatch ? " — 크기 불일치" : ""}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, next: ViewMode | null) => next && setMode(next)}
        >
          <ToggleButton value="overlay">슬라이더 오버레이</ToggleButton>
          <ToggleButton value="side-by-side">나란히 보기</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {mode === "side-by-side" ? (
        <>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <ImageCard label="디자인" src={entry.designRelPath} regions={result.regions} imageWidth={result.width} imageHeight={result.height} />
            <ImageCard label="퍼블리싱" src={entry.captureRelPath} regions={result.regions} imageWidth={result.width} imageHeight={result.height} />
            <ImageCard label="Diff" src={entry.diffRelPath} />
          </Stack>
          {result.regions.length > 0 && <RegionTable regions={result.regions} />}
        </>
      ) : (
        <Box sx={{ maxWidth: result.width }}>
          <Box
            sx={{
              position: "relative",
              width: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden",
              lineHeight: 0,
            }}
          >
            <Box component="img" src={entry.designRelPath} sx={{ width: "100%", display: "block" }} />
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                clipPath: `inset(0 ${100 - sliderValue}% 0 0)`,
              }}
            >
              <Box component="img" src={entry.captureRelPath} sx={{ width: "100%", display: "block" }} />
            </Box>
            <Box
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${sliderValue}%`,
                width: "2px",
                bgcolor: "primary.main",
                pointerEvents: "none",
              }}
            />
          </Box>
          <Slider
            value={sliderValue}
            onChange={(_, v) => setSliderValue(v as number)}
            sx={{ mt: 2 }}
          />
          <Typography variant="caption" color="text.secondary">
            왼쪽: 퍼블리싱 · 오른쪽: 디자인 (슬라이더로 경계를 이동해 비교)
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function ImageCard({
  label,
  src,
  regions,
  imageWidth,
  imageHeight,
}: {
  label: string;
  src: string;
  regions?: DiffRegion[];
  imageWidth?: number;
  imageHeight?: number;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 240 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ position: "relative", lineHeight: 0 }}>
        <Box
          component="img"
          src={src}
          sx={{ width: "100%", border: "1px solid", borderColor: "divider", borderRadius: 1, display: "block" }}
        />
        {regions && regions.length > 0 && imageWidth && imageHeight && (
          <RegionOverlay regions={regions} imageWidth={imageWidth} imageHeight={imageHeight} />
        )}
      </Box>
    </Box>
  );
}

function RegionTable({ regions }: { regions: DiffRegion[] }) {
  return (
    <Table size="small" sx={{ mt: 2, maxWidth: 480 }}>
      <TableHead>
        <TableRow>
          <TableCell>#</TableCell>
          <TableCell>위치 (x, y)</TableCell>
          <TableCell>크기 (w×h)</TableCell>
          <TableCell align="right">diff 픽셀 수</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {regions.map((r, i) => (
          <TableRow key={i}>
            <TableCell>{i + 1}</TableCell>
            <TableCell>
              {r.x}, {r.y}
            </TableCell>
            <TableCell>
              {r.width}×{r.height}
            </TableCell>
            <TableCell align="right">{r.diffPixelCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
