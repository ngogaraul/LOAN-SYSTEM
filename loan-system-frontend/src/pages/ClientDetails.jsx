import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";

import {
  Box, Typography, Paper, Divider, Grid, Stack, TextField, Button,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, Chip
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";

function statusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "success";
  if (s === "SUSPENDED") return "warning";
  if (s === "CLOSED") return "default";
  return "default";
}

function fmtMoney(x) {
  if (x === null || x === undefined || x === "") return "-";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}

export default function ClientDetails() {
  const { id } = useParams();
  const { enqueueSnackbar } = useSnackbar();

  const [tab, setTab] = useState(0);

  const [data, setData] = useState(null);
  const [creditlines, setCreditlines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // financial form (aggregated)
  const [form, setForm] = useState({
    outstanding: "", payment_plan: "", remaining_period: "", periodicity: "", class_value: "",
    compulsory_saving: "", voluntary_saving: "", salary: "", duration: "", start_date: "",
  });

  // profile edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  async function loadClient() {
    setErr("");
    setLoading(true);
    try {
      const res = await api.get(`/clients/${id}`);
      setData(res.data);

      setProfile({
        full_name: res.data.full_name || "",
        phone: res.data.phone || "",
      });

      const fin = res.data.financials || {};
      setForm({
        outstanding: fin.outstanding ?? "",
        payment_plan: fin.payment_plan ?? "",
        remaining_period: fin.remaining_period ?? "",
        periodicity: fin.periodicity ?? "",
        class_value: fin.class_value ?? "",
        compulsory_saving: fin.compulsory_saving ?? "",
        voluntary_saving: fin.voluntary_saving ?? "",
        salary: fin.salary ?? "",
        duration: fin.duration ?? "",
        start_date: fin.start_date ?? "",
      });
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to load client";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function loadCreditlines() {
    try {
      const res = await api.get(`/clients/${id}/creditlines`);
      setCreditlines(res.data || []);
    } catch (e) {
      // don’t kill the whole page if this fails
      setCreditlines([]);
    }
  }

  useEffect(() => {
    loadClient();
    loadCreditlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveFinancials() {
    setSaving(true);
    try {
      await api.put(`/clients/${id}/financials`, form);
      enqueueSnackbar("Financials updated.", { variant: "success" });
      await loadClient();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await api.put(`/clients/${id}`, profile);
      enqueueSnackbar("Client profile updated.", { variant: "success" });
      setEditOpen(false);
      await loadClient();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (err && !data) return <Alert severity="error">{err}</Alert>;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">
            Client: {data.account} — {data.full_name}{" "}
            <Chip size="small" label={data.status || "ACTIVE"} color={statusColor(data.status)} sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Phone: {data.phone || "-"}
          </Typography>
        </Box>

        <Tooltip title="Edit profile">
          <IconButton onClick={() => setEditOpen(true)}>
            <EditIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="Profile" />
          <Tab label="Aggregated Financials" />
          <Tab label="Creditlines" />
        </Tabs>
      </Paper>

      {/* PROFILE */}
      {tab === 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Profile</Typography>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><Typography><b>Account:</b> {data.account}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography><b>Name:</b> {data.full_name}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography><b>Phone:</b> {data.phone || "-"}</Typography></Grid>
          </Grid>
        </Paper>
      )}

      {/* AGGREGATED FINANCIALS (used by ML scoring) */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Aggregated Financials</Typography>
          <Typography variant="body2" color="text.secondary">
            These fields are what the model uses to score the client.
          </Typography>
          <Divider sx={{ my: 1 }} />

          <Grid container spacing={2}>
            {Object.entries(form).map(([k, v]) => (
              <Grid item xs={12} md={4} key={k}>
                <TextField
                  fullWidth
                  label={k.replaceAll("_", " ")}
                  value={v}
                  onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                />
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={loadClient} disabled={saving}>Reset</Button>
            <Button variant="contained" onClick={saveFinancials} disabled={saving}>
              {saving ? "Saving..." : "Save Financials"}
            </Button>
          </Stack>
        </Paper>
      )}

      {/* CREDITLINES (raw rows from Excel) */}
      {tab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Creditlines</Typography>
            <Button variant="outlined" onClick={loadCreditlines}>Refresh</Button>
          </Stack>
          <Divider sx={{ my: 1 }} />

          {creditlines.length === 0 ? (
            <Alert severity="info">No creditlines found for this client.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Creditline</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell align="right">Payment plan</TableCell>
                  <TableCell align="right">Days in arrears</TableCell>
                  <TableCell>Start date</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {creditlines.map((cl) => (
                  <TableRow key={cl.id || `${cl.creditline}-${cl.start_date}`}>
                    <TableCell>{cl.creditline || "-"}</TableCell>
                    <TableCell align="right">{fmtMoney(cl.outstanding)}</TableCell>
                    <TableCell align="right">{fmtMoney(cl.payment_plan)}</TableCell>
                    <TableCell align="right">{cl.days_in_arrears ?? "-"}</TableCell>
                    <TableCell>{cl.start_date || "-"}</TableCell>
                    <TableCell align="right">{cl.duration ?? "-"}</TableCell>
                    <TableCell align="right">{cl.remaining_period ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Client Profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Full name"
              value={profile.full_name}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
            />
            <TextField
              label="Phone"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}