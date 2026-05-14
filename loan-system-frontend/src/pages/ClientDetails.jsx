import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";

import {
  Box,
  Typography,
  Paper,
  Divider,
  Grid,
  Stack,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  TableContainer,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import EditIcon from "@mui/icons-material/Edit";

function statusColor(status) {
  const normalizedStatus = String(status || "").toUpperCase();
  if (normalizedStatus === "ACTIVE") return "success";
  if (normalizedStatus === "SUSPENDED") return "warning";
  if (normalizedStatus === "CLOSED") return "default";
  return "default";
}

function fmtMoney(value) {
  if (value === null || value === undefined || value === "") return "-";
  const parsedNumber = Number(value);
  if (Number.isNaN(parsedNumber)) return String(value);
  return parsedNumber.toLocaleString();
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
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Client: {data.account} - {data.full_name}{" "}
            <Chip size="small" label={data.status || "ACTIVE"} color={statusColor(data.status)} sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Phone: {data.phone || "-"}
          </Typography>
        </Box>

        {isMobile ? (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setEditOpen(true)}
            sx={{ width: "100%" }}
          >
            Edit profile
          </Button>
        ) : (
          <Tooltip title="Edit profile">
            <IconButton onClick={() => setEditOpen(true)} sx={{ alignSelf: { xs: "flex-end", sm: "auto" } }}>
              <EditIcon />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, nextTab) => setTab(nextTab)} variant={isMobile ? "scrollable" : "fullWidth"} allowScrollButtonsMobile>
          <Tab label="Profile" />
          <Tab label="Creditlines" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Profile</Typography>
          <Divider sx={{ my: 1.25 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><Typography><b>Account:</b> {data.account}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography><b>Name:</b> {data.full_name}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography><b>Phone:</b> {data.phone || "-"}</Typography></Grid>
          </Grid>
        </Paper>
      )}

      {tab === 1 && (
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, width: "100%", overflow: "hidden", borderRadius: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", sm: "center" }}
            spacing={1.5}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Creditlines</Typography>
            <Button variant="outlined" onClick={loadCreditlines} sx={{ alignSelf: { xs: "stretch", sm: "auto" } }}>
              Refresh
            </Button>
          </Stack>
          <Divider sx={{ my: 1 }} />

          {creditlines.length === 0 ? (
            <Alert severity="info">No creditlines found for this client.</Alert>
          ) : isMobile ? (
            <Stack spacing={1.5}>
              {creditlines.map((creditline) => (
                <Paper
                  key={creditline.id || `${creditline.creditline}-${creditline.start_date}`}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 2.5 }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                    {creditline.creditline || "-"}
                  </Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Account</Typography><Typography>{data.account || "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Outstanding</Typography><Typography>{fmtMoney(creditline.outstanding)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Principal Arrears</Typography><Typography>{fmtMoney(creditline.principal_arrears)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Interest Arrears</Typography><Typography>{fmtMoney(creditline.interest_arrears)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Payment Plan</Typography><Typography>{fmtMoney(creditline.payment_plan)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Days in Arrears</Typography><Typography>{creditline.days_in_arrears ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Start Date</Typography><Typography>{creditline.start_date || "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Duration</Typography><Typography>{creditline.duration ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Remaining Period</Typography><Typography>{creditline.remaining_period ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Periodicity</Typography><Typography>{creditline.periodicity ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Class</Typography><Typography>{creditline.class_value ?? "-"}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Compulsory Saving</Typography><Typography>{fmtMoney(creditline.compulsory_saving)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Voluntary Saving</Typography><Typography>{fmtMoney(creditline.voluntary_saving)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Salary</Typography><Typography>{fmtMoney(creditline.salary)}</Typography></Grid>
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
                    <TableCell align="right">Payment Plan</TableCell>
                    <TableCell align="right">Days in Arrears</TableCell>
                    <TableCell>Start Date</TableCell>
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
                  {creditlines.map((creditline) => (
                    <TableRow key={creditline.id || `${creditline.creditline}-${creditline.start_date}`}>
                      <TableCell>{data.account || "-"}</TableCell>
                      <TableCell>{creditline.creditline || "-"}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.outstanding)}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.principal_arrears)}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.interest_arrears)}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.payment_plan)}</TableCell>
                      <TableCell align="right">{creditline.days_in_arrears ?? "-"}</TableCell>
                      <TableCell>{creditline.start_date || "-"}</TableCell>
                      <TableCell align="right">{creditline.duration ?? "-"}</TableCell>
                      <TableCell align="right">{creditline.remaining_period ?? "-"}</TableCell>
                      <TableCell align="right">{creditline.periodicity ?? "-"}</TableCell>
                      <TableCell align="right">{creditline.class_value ?? "-"}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.compulsory_saving)}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.voluntary_saving)}</TableCell>
                      <TableCell align="right">{fmtMoney(creditline.salary)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Client Profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Full name"
              value={profile.full_name}
              onChange={(e) => setProfile((currentProfile) => ({ ...currentProfile, full_name: e.target.value }))}
            />
            <TextField
              label="Phone"
              value={profile.phone}
              onChange={(e) => setProfile((currentProfile) => ({ ...currentProfile, phone: e.target.value }))}
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
