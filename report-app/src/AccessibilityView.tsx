import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Link from "@mui/material/Link";
import type { AccessibilityResult, AccessibilityViolation, AxeSeverity } from "./types";

const SEVERITY_LABEL: Record<AxeSeverity, string> = {
  critical: "치명적",
  serious: "심각",
  moderate: "보통",
  minor: "경미",
};

const SEVERITY_COLOR: Record<AxeSeverity, "error" | "warning"> = {
  critical: "error",
  serious: "error",
  moderate: "warning",
  minor: "warning",
};

export function AccessibilityView({ accessibility }: { accessibility: AccessibilityResult | null }) {
  if (!accessibility) {
    return (
      <Typography variant="body2" color="text.secondary">
        이 화면은 접근성 검사를 수행하지 않았습니다.
      </Typography>
    );
  }

  if (accessibility.violations.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        발견된 접근성 위반 항목이 없습니다.
      </Typography>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {(Object.keys(SEVERITY_LABEL) as AxeSeverity[]).map((severity) => (
          <Chip
            key={severity}
            size="small"
            color={accessibility.countsBySeverity[severity] > 0 ? SEVERITY_COLOR[severity] : "default"}
            variant={accessibility.countsBySeverity[severity] > 0 ? "filled" : "outlined"}
            label={`${SEVERITY_LABEL[severity]} ${accessibility.countsBySeverity[severity]}`}
          />
        ))}
      </Stack>
      <Table size="small" sx={{ maxWidth: 960 }}>
        <TableHead>
          <TableRow>
            <TableCell>심각도</TableCell>
            <TableCell>규칙</TableCell>
            <TableCell>설명</TableCell>
            <TableCell>영향받은 요소</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {accessibility.violations.map((v) => (
            <ViolationRow key={v.id} violation={v} />
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function ViolationRow({ violation }: { violation: AccessibilityViolation }) {
  return (
    <TableRow>
      <TableCell>
        {violation.impact && (
          <Chip size="small" color={SEVERITY_COLOR[violation.impact]} label={SEVERITY_LABEL[violation.impact]} />
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: "normal" }}>
        <Link href={violation.helpUrl} target="_blank" rel="noopener" variant="body2">
          {violation.id}
        </Link>
      </TableCell>
      <TableCell sx={{ whiteSpace: "normal" }}>
        <Typography variant="caption">{violation.help}</Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: "normal" }}>
        <Typography variant="caption" component="div" color="text.secondary">
          {violation.nodeCount}개 요소
        </Typography>
        {violation.targets.map((t, i) => (
          <Typography key={i} variant="caption" component="div" sx={{ fontFamily: "monospace" }}>
            {t}
          </Typography>
        ))}
      </TableCell>
    </TableRow>
  );
}
