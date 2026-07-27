import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Slider from "@mui/material/Slider";
import Modal from "@mui/material/Modal";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { DiffRegion, ScreenReportEntry } from "./types";
import { RegionOverlay } from "./RegionOverlay";

const SCALE_MARKS = [25, 50, 75, 100].map((value) => ({ value, label: `${value}%` }));

type LightboxState = {
  label: string;
  src: string;
  regions?: DiffRegion[];
  imageWidth?: number;
  imageHeight?: number;
};

export function CompareView({ entry, showDiff }: { entry: ScreenReportEntry; showDiff: boolean }) {
  const { result } = entry;
  const [scale, setScale] = useState(100);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
          표시 배율 {scale}%
        </Typography>
        <Slider
          size="small"
          value={scale}
          onChange={(_, value) => setScale(value as number)}
          min={25}
          max={100}
          step={5}
          marks={SCALE_MARKS}
          valueLabelDisplay="auto"
          sx={{ width: 200, flexShrink: 0 }}
        />
      </Stack>
      <Box sx={{ overflowX: "auto", pb: 1 }}>
        <Stack direction="row" spacing={2} sx={{ width: "max-content" }}>
          <ImageCard
            label="디자인"
            src={entry.designRelPath}
            regions={showDiff ? result.regions : undefined}
            imageWidth={result.width}
            imageHeight={result.height}
            scale={scale}
            onExpand={setLightbox}
          />
          <ImageCard
            label="퍼블리싱"
            src={entry.captureRelPath}
            regions={showDiff ? result.regions : undefined}
            imageWidth={result.width}
            imageHeight={result.height}
            scale={scale}
            onExpand={setLightbox}
          />
        </Stack>
      </Box>
      {result.regions.length > 0 && <RegionTable regions={result.regions} />}
      <Lightbox state={lightbox} onClose={() => setLightbox(null)} />
    </Box>
  );
}

function ImageCard({
  label,
  src,
  regions,
  imageWidth,
  imageHeight,
  scale,
  onExpand,
}: {
  label: string;
  src: string;
  regions?: DiffRegion[];
  imageWidth?: number;
  imageHeight?: number;
  scale: number;
  onExpand: (state: LightboxState) => void;
}) {
  const displayWidth = imageWidth ? (imageWidth * scale) / 100 : undefined;

  return (
    <Box sx={{ flex: "none", minWidth: 240 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        onClick={() => onExpand({ label, src, regions, imageWidth, imageHeight })}
        title="클릭하면 원본 크기로 확인합니다"
        sx={{
          position: "relative",
          lineHeight: 0,
          display: "inline-block",
          maxWidth: "100%",
          cursor: "zoom-in",
        }}
      >
        <Box
          component="img"
          src={src}
          sx={{
            width: displayWidth ? `${displayWidth}px` : "100%",
            maxWidth: "100%",
            height: "auto",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            display: "block",
          }}
        />
        {regions && regions.length > 0 && imageWidth && imageHeight && (
          <RegionOverlay regions={regions} imageWidth={imageWidth} imageHeight={imageHeight} />
        )}
      </Box>
    </Box>
  );
}

function Lightbox({ state, onClose }: { state: LightboxState | null; onClose: () => void }) {
  return (
    <Modal open={state !== null} onClose={onClose}>
      <Box
        sx={{
          position: "absolute",
          inset: 16,
          bgcolor: "background.paper",
          borderRadius: 1,
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
        >
          <Typography variant="subtitle2">{state?.label} — 원본 크기</Typography>
          <Box
            component="button"
            onClick={onClose}
            sx={{
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
              px: 1,
              color: "text.secondary",
            }}
          >
            ×
          </Box>
        </Stack>
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {state && (
            <Box sx={{ position: "relative", lineHeight: 0, display: "inline-block" }}>
              <Box component="img" src={state.src} sx={{ display: "block" }} />
              {state.regions && state.regions.length > 0 && state.imageWidth && state.imageHeight && (
                <RegionOverlay regions={state.regions} imageWidth={state.imageWidth} imageHeight={state.imageHeight} />
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  );
}

function RegionTable({ regions }: { regions: DiffRegion[] }) {
  return (
    <Table size="small" sx={{ mt: 2, maxWidth: 820 }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ whiteSpace: "nowrap" }}>#</TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>위치 (x, y)</TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>크기 (w×h)</TableCell>
          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            <Tooltip title="이 영역(크기 w×h) 안에서 디자인과 퍼블리싱이 실제로 다르다고 판정된 픽셀 개수입니다. 크기 대비 값이 클수록 그 영역 대부분이 달라진 것입니다.">
              <Box component="span" sx={{ cursor: "help", borderBottom: "1px dashed", borderColor: "text.secondary" }}>
                diff 픽셀 수
              </Box>
            </Tooltip>
          </TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>색상</TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>설명</TableCell>
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
            <TableCell>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <ColorSwatch color={r.designColor} title={`디자인 ${r.designColor}`} />
                <ColorSwatch color={r.captureColor} title={`퍼블리싱 ${r.captureColor}`} />
              </Stack>
            </TableCell>
            <TableCell sx={{ whiteSpace: "normal" }}>
              <Typography variant="caption">{r.description}</Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ColorSwatch({ color, title }: { color: string; title: string }) {
  return (
    <Box
      title={title}
      sx={{
        width: 14,
        height: 14,
        borderRadius: 0.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: color,
        flexShrink: 0,
      }}
    />
  );
}
