import Box from "@mui/material/Box";
import type { DiffRegion } from "./types";

export function RegionOverlay({
  regions,
  imageWidth,
  imageHeight,
}: {
  regions: DiffRegion[];
  imageWidth: number;
  imageHeight: number;
}) {
  return (
    <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {regions.map((region, i) => (
        <Box
          key={i}
          sx={{
            position: "absolute",
            left: `${(region.x / imageWidth) * 100}%`,
            top: `${(region.y / imageHeight) * 100}%`,
            width: `${(region.width / imageWidth) * 100}%`,
            height: `${(region.height / imageHeight) * 100}%`,
            border: "2px solid",
            borderColor: "error.main",
            bgcolor: "rgba(211, 47, 47, 0.15)",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: -10,
              left: -10,
              width: 20,
              height: 20,
              borderRadius: "50%",
              bgcolor: "error.main",
              color: "error.contrastText",
              fontSize: 12,
              lineHeight: "20px",
              textAlign: "center",
            }}
          >
            {i + 1}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
