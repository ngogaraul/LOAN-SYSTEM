import { useEffect, useState } from "react";
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
} from "@mui/material";

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

function StatCard({ title, value, color = "default" }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h4" sx={{ mt: 0.5 }}>
        {value ?? 0}
      </Typography>
      <Chip size="small" label={title} color={color} sx={{ mt: 1 }} />
    </Paper>
  );
}

export default function Dashboard() {
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

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Overview of loan applications and risk distribution
          </Typography>
        </Box>
      </Stack>

      {/* Status Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="SUBMITTED" value={status.SUBMITTED} color="default" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="SCORED" value={status.SCORED} color="info" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="REVIEW" value={status.REVIEW} color="warning" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="APPROVED" value={status.APPROVED} color="success" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="REJECTED" value={status.REJECTED} color="error" />
        </Grid>
      </Grid>

      {/* Risk band distribution */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Risk Bands</Typography>
        {Object.keys(bandCounts).length === 0 ? (
          <Typography variant="body2" color="text.secondary">No scored applications yet.</Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {Object.entries(bandCounts).map(([band, count]) => (
              <Chip key={band} label={`${band}: ${count}`} sx={{ mb: 1 }} />
            ))}
          </Stack>
        )}
      </Paper>

      {/* Recent Applications */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Recent Applications</Typography>
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
              <TableRow key={a.id}>
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
      </Paper>
    </Box>
  );
}
