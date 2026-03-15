import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";

import {
  Box, Typography, Paper, Divider, Grid, Stack, TextField, Button,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, Chip,
  TableContainer, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [tab, setTab] = useState(0);

  const [data, setData] = useState(null);
  const [creditlines, setCreditlines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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
    } catch {
      // Don't kill the whole page if this request fails.
      setCreditlines([]);
    }
  }

  useEffect(() => {
    loadClient();
    loadCreditlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    <Box sx={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2 }}
      >
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
          <IconButton onClick={() => setEditOpen(true)} sx={{ alignSelf: { xs: "flex-end", sm: "auto" } }}>
            <EditIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="Profile" />
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

      {/* CREDITLINES (raw rows from Excel) */}
      {tab === 1 && (
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, width: "100%", overflow: "hidden" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", sm: "center" }}
            spacing={1.5}
          >
            <Typography variant="h6">Creditlines</Typography>
            <Button variant="outlined" onClick={loadCreditlines} sx={{ alignSelf: { xs: "flex-start", sm: "auto" } }}>
              Refresh
            </Button>
          </Stack>
          <Divider sx={{ my: 1 }} />

          {creditlines.length === 0 ? (
            <Alert severity="info">No creditlines found for this client.</Alert>
          ) : isMobile ? (
            <Stack spacing={1.5}>
              {creditlines.map((cl) => (
                <Paper
                  key={cl.id || `${cl.creditline}-${cl.start_date}`}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 2 }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {cl.creditline || "-"}
                  </Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Account</Typography><Typography>{data.account || "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Outstanding</Typography><Typography>{fmtMoney(cl.outstanding)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Principal Arrears</Typography><Typography>{fmtMoney(cl.principal_arrears)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Interest Arrears</Typography><Typography>{fmtMoney(cl.interest_arrears)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Payment Plan</Typography><Typography>{fmtMoney(cl.payment_plan)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Days in Arrears</Typography><Typography>{cl.days_in_arrears ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Start Date</Typography><Typography>{cl.start_date || "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Duration</Typography><Typography>{cl.duration ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Remaining Period</Typography><Typography>{cl.remaining_period ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Periodicity</Typography><Typography>{cl.periodicity ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Class</Typography><Typography>{cl.class_value ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Compulsory Saving</Typography><Typography>{fmtMoney(cl.compulsory_saving)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Voluntary Saving</Typography><Typography>{fmtMoney(cl.voluntary_saving)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Salary</Typography><Typography>{fmtMoney(cl.salary)}</Typography></Grid>
                  </Grid>
                </Paper>
              ))}
            </Stack>
          ) : (
            <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 1500 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell>Creditline</TableCell>
                    <TableCell align="right">Outstanding</TableCell>
                    <TableCell align="right">Principal Arrears</TableCell>
                    <TableCell align="right">Interest Arrears</TableCell>
                    <TableCell align="right">Payment plan</TableCell>
                    <TableCell align="right">Days in arrears</TableCell>
                    <TableCell>Start date</TableCell>
                    <TableCell align="right">Duration</TableCell>
                    <TableCell align="right">Remaining Period</TableCell>
                    <TableCell align="right">Periodicity</TableCell>
                    <TableCell align="right">Class</TableCell>
                    <TableCell align="right">Compulsory Saving</TableCell>
                    <TableCell align="right">Voluntary Saving</TableCell>
                    <TableCell align="right">Salary</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {creditlines.map((cl) => (
                    <TableRow key={cl.id || `${cl.creditline}-${cl.start_date}`}>
                      <TableCell>{data.account || "-"}</TableCell>
                      <TableCell>{cl.creditline || "-"}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.outstanding)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.principal_arrears)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.interest_arrears)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.payment_plan)}</TableCell>
                      <TableCell align="right">{cl.days_in_arrears ?? "-"}</TableCell>
                      <TableCell>{cl.start_date || "-"}</TableCell>
                      <TableCell align="right">{cl.duration ?? "-"}</TableCell>
                      <TableCell align="right">{cl.remaining_period ?? "-"}</TableCell>
                      <TableCell align="right">{cl.periodicity ?? "-"}</TableCell>
                      <TableCell align="right">{cl.class_value ?? "-"}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.compulsory_saving)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.voluntary_saving)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.salary)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
