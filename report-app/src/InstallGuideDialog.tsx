import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface InstallGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Section {
  key: string;
  label: string;
  chip: string;
  chipColor: "default" | "primary" | "success" | "warning";
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    key: "overview",
    label: "이 가이드는 무엇을 위한 건가요?",
    chip: "개요",
    chipColor: "default",
    body: (
      <Stack spacing={1.5}>
        <Typography variant="body2">
          지금 이 화면을 보고 계신 PC에는 이미 프로그램 실행에 필요한 것들(
          <code>node_modules</code>, 브라우저 엔진 캐시, 리포트 화면 빌드본)이 전부 갖춰져 있습니다.
          즉 <b>이 PC 자체가 "이미 설치가 끝난 상태"</b>입니다.
        </Typography>
        <Typography variant="body2">
          이 가이드는 <b>같은 폐쇄망(인터넷 차단) 안에 있는 다른 PC들</b>에도 이 프로그램을 쓸 수
          있게 하려면 무엇을, 어떤 순서로 옮기면 되는지를 설명합니다. 어느 PC에도 새로 인터넷에
          접속할 필요가 없습니다 — 이미 이 PC에 준비된 것을 그대로 복제하기만 하면 됩니다.
        </Typography>
        <Alert severity="info" variant="outlined">
          단, 옮겨갈 다른 PC도 <b>이 PC와 같은 종류의 Windows(64비트)</b>여야 합니다. 프로그램
          부품 중 일부는 특정 PC 종류에 맞춰 미리 컴파일되어 있어서, 완전히 다른 종류의 PC(예:
          ARM 기반 PC)에서는 그대로 복사해도 동작하지 않을 수 있습니다.
        </Alert>
      </Stack>
    ),
  },
  {
    key: "package",
    label: "1단계 · 이 PC에서 배포 패키지 만들기",
    chip: "패키징",
    chipColor: "primary",
    body: (
      <Stack spacing={1.5}>
        <Typography variant="body2">
          다른 PC로 옮길 압축(zip) 파일을 만듭니다. 아래 3가지를 하나로 모아 압축하세요.
        </Typography>
        <List dense sx={{ listStyleType: "disc", pl: 3, "& .MuiListItem-root": { display: "list-item", py: 0.25 } }}>
          <ListItem disablePadding>
            프로젝트 폴더 전체 (<code>node_modules</code> 폴더 포함 — 지금 이 화면이 들어있는 바로 그 폴더)
          </ListItem>
          <ListItem disablePadding>
            브라우저 엔진 캐시 폴더 — <code>C:\Users\내 계정\AppData\Local\ms-playwright</code>
            <br />
            <Typography component="span" variant="caption" color="text.secondary">
              (주의: 프로젝트 폴더 안이 아니라 내 계정 폴더 아래에 따로 있습니다. 빠뜨리면 다른 PC에서
              화면 촬영이 되지 않습니다.)
            </Typography>
          </ListItem>
          <ListItem disablePadding>
            Node.js 설치용 파일 또는 폴더 — 아래 둘 중 하나
            <List dense sx={{ listStyleType: "circle", pl: 3 }}>
              <ListItem disablePadding sx={{ display: "list-item", py: 0.25 }}>
                가지고 있는 Node.js 설치 파일(.msi)이 있다면 그것을 그대로 포함
              </ListItem>
              <ListItem disablePadding sx={{ display: "list-item", py: 0.25 }}>
                설치 파일이 없다면, 이 PC의 <code>C:\Program Files\nodejs</code> 폴더를 통째로 복사해서
                포함 (대상 PC의 같은 위치에 그대로 붙여넣고 환경변수 PATH에 추가하는 방식으로 설치를
                대신할 수 있습니다)
              </ListItem>
            </List>
          </ListItem>
        </List>
        <Alert severity="info" variant="outlined">
          한글/영문 글자 인식(OCR)용 데이터 파일과 리포트 화면 빌드본은 프로젝트 폴더 안에 이미
          포함되어 있으므로 별도로 챙기지 않아도 됩니다.
        </Alert>
      </Stack>
    ),
  },
  {
    key: "transfer",
    label: "2단계 · 다른 PC로 옮기기",
    chip: "이동",
    chipColor: "primary",
    body: (
      <Stack spacing={1.5}>
        <Typography variant="body2">
          만든 압축 파일을 USB 등 이동식 매체로 옮깁니다. 회사 보안 정책에 따른 바이러스 검사
          절차를 거쳐주세요.
        </Typography>
        <Alert severity="warning" variant="outlined">
          <code>node_modules</code> 폴더는 파일 개수가 수만 개로 매우 많습니다. 윈도우 탐색기로
          폴더를 그대로 드래그해서 복사하면 경로가 너무 길어 일부 파일이 조용히 누락될 수 있으니,
          반드시 압축(zip) 상태로 옮기고 대상 PC에서 압축을 풀어주세요.
        </Alert>
      </Stack>
    ),
  },
  {
    key: "install",
    label: "3단계 · 옮겨간 PC에 적용하기",
    chip: "설치",
    chipColor: "success",
    body: (
      <Stack spacing={1.5}>
        <Typography variant="body2">순서대로 진행합니다.</Typography>
        <List
          dense
          sx={{ listStyleType: "decimal", pl: 3, "& .MuiListItem-root": { display: "list-item", py: 0.5 } }}
        >
          <ListItem disablePadding>
            Node.js를 준비합니다. 가져온 것이 설치 파일(.msi)이면 실행해서 설치하고, 폴더라면
            그 내용을 대상 PC의 <code>C:\Program Files\nodejs</code> 위치에 복사한 뒤 환경변수
            PATH에 이 경로를 추가합니다.
          </ListItem>
          <ListItem disablePadding>
            압축 해제한 프로젝트 폴더를 원하는 위치에 둡니다.
            <br />
            <Typography component="span" variant="caption" color="error.main">
              이 폴더 안에서 <code>npm install</code>을 실행하지 마세요 — 인터넷이 없어 실패합니다.
              이미 필요한 부품이 다 들어있으니 그대로 실행하면 됩니다.
            </Typography>
          </ListItem>
          <ListItem disablePadding>
            옮겨온 브라우저 엔진 캐시 폴더 내용을 이 PC의{" "}
            <code>C:\Users\내 계정\AppData\Local\ms-playwright</code> 위치에 그대로 복사합니다.
          </ListItem>
          <ListItem disablePadding>
            <code>qa.config.json</code>을 열어 <code>baseUrl</code>을 이 PC에서 실제로 비교할 화면 주소로
            바꿉니다.
          </ListItem>
          <ListItem disablePadding>
            프로젝트 폴더에서 아래 명령으로 실행합니다.
            <Box
              component="pre"
              sx={{ bgcolor: "grey.100", p: 1.5, borderRadius: 1, fontSize: 13, overflowX: "auto", mt: 1 }}
            >
              npm run qa
            </Box>
          </ListItem>
          <ListItem disablePadding>
            완료되면 <code>reports</code> 폴더 안에 결과 파일(<code>index.html</code>)이 생기고 자동으로
            브라우저에 열립니다. 이 파일 하나만 복사해도 다른 사람에게 그대로 결과를 보여줄 수 있습니다.
          </ListItem>
        </List>
      </Stack>
    ),
  },
  {
    key: "faq",
    label: "자주 발생하는 문제",
    chip: "문제 해결",
    chipColor: "warning",
    body: (
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            "report-app 빌드 산출물이 없습니다" 오류가 나요
          </Typography>
          <Typography variant="body2" color="text.secondary">
            1단계에서 프로젝트 폴더를 압축할 때 <code>report-app/dist</code> 폴더가 빠진
            경우입니다. 이 폴더가 포함됐는지 다시 확인하세요.
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            실행하면 계속 멈춰있거나 인터넷을 찾는 것 같아요
          </Typography>
          <Typography variant="body2" color="text.secondary">
            브라우저 엔진 캐시 폴더(<code>ms-playwright</code>)를 옮기지 않았거나 다른 위치에 둔
            경우입니다. 3단계의 경로에 그대로 있는지 확인하세요.
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            "node를 찾을 수 없습니다" 같은 오류가 나요
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Node.js를 폴더 복사 방식으로 옮겼다면 환경변수 PATH에 <code>C:\Program Files\nodejs</code>
            경로가 등록되지 않은 경우입니다. 시스템 환경변수 설정에서 PATH에 추가해주세요.
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            화면 비교 결과가 디자인과 완전히 다르게 나와요
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <code>qa.config.json</code>의 화면 크기 설정이 디자인 이미지와 맞지 않는 경우 흔히
            발생합니다. 디자인 이미지의 실제 가로/세로 크기에 맞춰 설정을 조정하세요.
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            한글이나 이모지가 네모(□)로 깨져 보여요
          </Typography>
          <Typography variant="body2" color="text.secondary">
            보통 윈도우 기본 폰트로 문제없이 표시되지만, 디자인이 특정 웹폰트를 기준으로 만들어졌다면
            해당 폰트를 대상 PC에 별도로 설치해야 정확히 비교됩니다.
          </Typography>
        </Box>
      </Stack>
    ),
  },
];

export function InstallGuideDialog({ open, onClose }: InstallGuideDialogProps) {
  const [expanded, setExpanded] = useState<string | false>("overview");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>다른 폐쇄망 PC에 옮기는 방법</DialogTitle>
      <DialogContent dividers>
        {SECTIONS.map((section) => (
          <Accordion
            key={section.key}
            disableGutters
            expanded={expanded === section.key}
            onChange={(_, isExpanded) => setExpanded(isExpanded ? section.key : false)}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Chip size="small" label={section.chip} color={section.chipColor} />
                <Typography fontWeight={600}>{section.label}</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>{section.body}</AccordionDetails>
          </Accordion>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}
