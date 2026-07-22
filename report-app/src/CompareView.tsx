import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { DiffRegion, ScreenReportEntry } from "./types";
import { RegionOverlay } from "./RegionOverlay";

export function CompareView({ entry }: { entry: ScreenReportEntry }) {
  const { result } = entry;

  return (
    <Box>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <ImageCard label="디자인" src={entry.designRelPath} regions={result.regions} imageWidth={result.width} imageHeight={result.height} />
        <ImageCard label="퍼블리싱" src={entry.captureRelPath} regions={result.regions} imageWidth={result.width} imageHeight={result.height} />
      </Stack>
      {result.regions.length > 0 && <RegionTable regions={result.regions} />}
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
    <Box sx={{ flex: "none", minWidth: 240 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ position: "relative", lineHeight: 0, display: "inline-block", maxWidth: "100%" }}>
        <Box
          component="img"
          src={src}
          sx={{
            width: imageWidth ? `${imageWidth}px` : "100%",
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

function RegionTable({ regions }: { regions: DiffRegion[] }) {
  return (
    <Table size="small" sx={{ mt: 2, maxWidth: 820 }}>
      <TableHead>
        <TableRow>
          <TableCell>#</TableCell>
          <TableCell>위치 (x, y)</TableCell>
          <TableCell>크기 (w×h)</TableCell>
          <TableCell align="right">
            <Tooltip title="이 영역(크기 w×h) 안에서 디자인과 퍼블리싱이 실제로 다르다고 판정된 픽셀 개수입니다. 크기 대비 값이 클수록 그 영역 대부분이 달라진 것입니다.">
              <Box component="span" sx={{ cursor: "help", borderBottom: "1px dashed", borderColor: "text.secondary" }}>
                diff 픽셀 수
              </Box>
            </Tooltip>
          </TableCell>
          <TableCell>색상</TableCell>
          <TableCell>설명</TableCell>
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
