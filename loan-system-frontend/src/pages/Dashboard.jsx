import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import {
  Box,
  Typography,
  Grid,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Stack,
  TableContainer,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

function statusColor(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "REVIEW") return "warning";
  if (status === "SCORED") return "info";
  return "default";
}

function fmtDate(x) {
  if (!x) return "-";
  return String(x).replace("T", " ").replace(".000Z", "");
}

function StatCard({ title, value, color = "default", accent }) {
  return (
    <Paper
      sx={{
        p: 2,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        backgroundImage: accent
          ? `linear-gradient(140deg, ${accent} 0%, transparent 65%)`
          : "none",
      }}
    >
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h4" sx={{ mt: 0.75, fontWeight: 800 }}>
        {value ?? 0}
      </Typography>
      <Chip size="small" label={title} color={color} sx={{ mt: 1.25 }} />
    </Paper>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await api.get("/dashboard");
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.response?.data?.error || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (err) {
    return <Alert severity="error">{err}</Alert>;
  }

  const status = data?.status_counts || {};
  const recent = data?.recent_applications || [];
  const bandCounts = data?.risk_band_counts || {};
  const totalApplications = Object.values(status).reduce(
    (sum, count) => sum + Number(count || 0),
    0
  );

  return (
    <Box>
      <Paper
        sx={{
          p: { xs: 2, sm: 2.5, md: 3 },
          mb: 2,
          borderRadius: 4,
          background: theme.palette.mode === "dark"
            ? "linear-gradient(145deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.82))"
            : "linear-gradient(145deg, rgba(239, 246, 255, 0.92), rgba(255, 255, 255, 0.96))",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          spacing={2}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Dashboard
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", md: "auto" } }}>
            <Chip label={`Total applications: ${totalApplications}`} color="primary" />
          </Stack>
        </Stack>
      </Paper>

      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} sx={{ mb: 2 }} spacing={1}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Application Status</Typography>
        </Box>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <StatCard title="SUBMITTED" value={status.SUBMITTED} color="default" accent="rgba(148, 163, 184, 0.10)" />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <StatCard title="SCORED" value={status.SCORED} color="info" accent="rgba(59, 130, 246, 0.10)" />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <StatCard title="REVIEW" value={status.REVIEW} color="warning" accent="rgba(245, 158, 11, 0.10)" />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <StatCard title="APPROVED" value={status.APPROVED} color="success" accent="rgba(16, 185, 129, 0.10)" />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <StatCard title="REJECTED" value={status.REJECTED} color="error" accent="rgba(239, 68, 68, 0.10)" />
        </Grid>
      </Grid>

      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>Risk Bands</Typography>
        {Object.keys(bandCounts).length === 0 ? (
          <Typography variant="body2" color="text.secondary">No scored applications yet.</Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {Object.entries(bandCounts).map(([band, count]) => (
              <Chip key={band} label={`${band}: ${count}`} sx={{ mb: 1 }} />
            ))}
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={1}
          sx={{ mb: 1 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Recent Applications</Typography>
        </Stack>
        {recent.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No recent applications.</Typography>
        ) : isMobile ? (
          <Stack spacing={1.5}>
            {recent.map((a) => (
              <Paper
                key={a.id}
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 3, cursor: "pointer" }}
                onClick={() => navigate(`/applications/${a.id}`)}
              >
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Application #{a.id}
                    </Typography>
                    <Chip size="small" label={a.status} color={statusColor(a.status)} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Client ID: {a.client_id}
                  </Typography>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Amount</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {Number(a.amount_requested).toLocaleString()}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="caption" color="text.secondary">Submitted</Typography>
                      <Typography variant="body2">{fmtDate(a.submitted_at)}</Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Submitted</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recent.map((a) => (
                  <TableRow key={a.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/applications/${a.id}`)}>
                    <TableCell>{a.id}</TableCell>
                    <TableCell>{a.client_id}</TableCell>
                    <TableCell>{Number(a.amount_requested).toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip size="small" label={a.status} color={statusColor(a.status)} />
                    </TableCell>
                    <TableCell>{fmtDate(a.submitted_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
