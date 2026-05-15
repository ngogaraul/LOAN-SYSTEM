import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { getAuth } from "../auth/auth";
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

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

function fmtDateTime(value) {
  if (!value) return "-";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return String(value);
  return parsedDate.toLocaleString();
}

function applicationStatusColor(status) {
  const normalizedStatus = String(status || "").toUpperCase();
  if (normalizedStatus === "APPROVED") return "success";
  if (normalizedStatus === "REJECTED") return "error";
  if (normalizedStatus === "REVIEW") return "warning";
  if (normalizedStatus === "SCORED") return "info";
  return "default";
}

function buildCreditlineDraft(creditline) {
  return {
    id: creditline?.id ?? null,
    current_creditline: creditline?.creditline || "",
    creditline: creditline?.creditline || "",
    outstanding: String(creditline?.outstanding ?? 0),
    principal_arrears: String(creditline?.principal_arrears ?? 0),
    interest_arrears: String(creditline?.interest_arrears ?? 0),
    payment_plan: String(creditline?.payment_plan ?? 0),
    interest_rate: String(creditline?.interest_rate ?? 0),
    days_in_arrears: String(creditline?.days_in_arrears ?? 0),
    start_date: creditline?.start_date || "",
    duration: String(creditline?.duration ?? 0),
    remaining_period: String(creditline?.remaining_period ?? 0),
    periodicity: String(creditline?.periodicity ?? 0),
    class_value: String(creditline?.class_value ?? 0),
    compulsory_saving: String(creditline?.compulsory_saving ?? 0),
    voluntary_saving: String(creditline?.voluntary_saving ?? 0),
    salary: String(creditline?.salary ?? 0),
  };
}

export default function ClientDetails() {
  const { id } = useParams();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const role = (getAuth()?.role || "ANALYST").toUpperCase();
  const isAdmin = role === "ADMIN";

  const [tab, setTab] = useState(0);

  const [data, setData] = useState(null);
  const [creditlines, setCreditlines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [creditlineEditOpen, setCreditlineEditOpen] = useState(false);
  const [creditlineDraft, setCreditlineDraft] = useState(null);
  const [savingCreditline, setSavingCreditline] = useState(false);
  const [sendingEditCode, setSendingEditCode] = useState(false);
  const [editVerificationCode, setEditVerificationCode] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingCreditline, setDeletingCreditline] = useState(false);
  const [sendingDeleteCode, setSendingDeleteCode] = useState(false);
  const [deleteVerificationCode, setDeleteVerificationCode] = useState("");

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

  function openCreditlineEditor(creditline) {
    setCreditlineDraft(buildCreditlineDraft(creditline));
    setEditVerificationCode("");
    setCreditlineEditOpen(true);
  }

  function openDeleteDialog(creditline) {
    setDeleteTarget(creditline);
    setDeleteVerificationCode("");
  }

  function updateCreditlineField(field, value) {
    setCreditlineDraft((currentCreditlineDraft) => ({
      ...currentCreditlineDraft,
      [field]: value,
    }));
  }

  async function sendAdminVerificationCode(action, creditline, setSending) {
    if (!creditline) return;

    setSending(true);
    try {
      await api.post("/auth/admin-action/request-code", {
        action,
        client_id: Number(id),
        creditline,
      });
      enqueueSnackbar("Verification code sent to the admin email.", { variant: "success" });
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to send verification code";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSending(false);
    }
  }

  async function saveCreditline() {
    if (!creditlineDraft?.current_creditline) return;
    if (!editVerificationCode.trim()) {
      enqueueSnackbar("Enter the verification code sent to the admin email.", { variant: "warning" });
      return;
    }

    setSavingCreditline(true);
    try {
      await api.put(`/clients/${id}/creditlines/by-value`, {
        current_creditline: creditlineDraft.current_creditline,
        creditline: creditlineDraft.creditline,
        outstanding: creditlineDraft.outstanding,
        principal_arrears: creditlineDraft.principal_arrears,
        interest_arrears: creditlineDraft.interest_arrears,
        payment_plan: creditlineDraft.payment_plan,
        interest_rate: creditlineDraft.interest_rate,
        days_in_arrears: creditlineDraft.days_in_arrears,
        start_date: creditlineDraft.start_date,
        duration: creditlineDraft.duration,
        remaining_period: creditlineDraft.remaining_period,
        periodicity: creditlineDraft.periodicity,
        class_value: creditlineDraft.class_value,
        compulsory_saving: creditlineDraft.compulsory_saving,
        voluntary_saving: creditlineDraft.voluntary_saving,
        salary: creditlineDraft.salary,
        verification_code: editVerificationCode,
      });
      enqueueSnackbar("Creditline updated.", { variant: "success" });
      setCreditlineEditOpen(false);
      setCreditlineDraft(null);
      setEditVerificationCode("");
      await loadCreditlines();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to update creditline";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSavingCreditline(false);
    }
  }

  async function deleteCreditline() {
    if (!deleteTarget?.creditline) return;
    if (!deleteVerificationCode.trim()) {
      enqueueSnackbar("Enter the verification code sent to the admin email.", { variant: "warning" });
      return;
    }

    setDeletingCreditline(true);
    try {
      const res = await api.delete(`/clients/${id}/creditlines/by-value`, {
        data: {
          creditline: deleteTarget.creditline,
          verification_code: deleteVerificationCode,
        },
      });
      const deletedCreditlineId = res?.data?.deleted_creditline_id;
      const deletedCreditlineLabel = deleteTarget.creditline;
      enqueueSnackbar("Creditline deleted.", {
        variant: "success",
        persist: Boolean(deletedCreditlineId),
        action: deletedCreditlineId ? (snackbarKey) => (
          <Button
            color="inherit"
            size="small"
            onClick={async () => {
              try {
                await api.post(`/clients/${id}/creditlines/undo-delete`, {
                  deleted_creditline_id: deletedCreditlineId,
                });
                closeSnackbar(snackbarKey);
                enqueueSnackbar(`Creditline ${deletedCreditlineLabel} restored.`, { variant: "success" });
                await loadCreditlines();
              } catch (e) {
                const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to restore creditline";
                enqueueSnackbar(msg, { variant: "error" });
              }
            }}
          >
            Undo
          </Button>
        ) : undefined,
      });
      setDeleteTarget(null);
      setDeleteVerificationCode("");
      await loadCreditlines();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to delete creditline";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeletingCreditline(false);
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
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                        {creditline.creditline || "-"}
                      </Typography>
                      {creditline.application && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <Chip
                            size="small"
                            label={creditline.application.status || "SUBMITTED"}
                            color={applicationStatusColor(creditline.application.status)}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Loan #{creditline.application.id}
                          </Typography>
                        </Stack>
                      )}
                    </Box>

                    {isAdmin && (
                      <Stack direction="row" spacing={0.5}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditIcon fontSize="small" />}
                          onClick={() => openCreditlineEditor(creditline)}
                        >
                          Edit
                        </Button>
                        <Tooltip title="Delete creditline">
                          <span>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              startIcon={<DeleteOutlineIcon fontSize="small" />}
                              onClick={() => openDeleteDialog(creditline)}
                            >
                              Delete
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    )}
                  </Stack>

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

                  {creditline.application && (
                    <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}>
                      <Typography variant="caption" color="text.secondary">Linked loan information</Typography>
                      <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Requested Amount</Typography>
                          <Typography>{fmtMoney(creditline.application.amount_requested)}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Payment Plan</Typography>
                          <Typography>{fmtMoney(creditline.application.payment_plan)}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Term</Typography>
                          <Typography>{creditline.application.term_requested ?? "-"}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Submitted</Typography>
                          <Typography>{fmtDateTime(creditline.application.submitted_at)}</Typography>
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary">Purpose</Typography>
                          <Typography>{creditline.application.purpose || "-"}</Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  )}
                </Paper>
              ))}
            </Stack>
          ) : (
            <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 1780 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell>Creditline</TableCell>
                    <TableCell>Loan Status</TableCell>
                    <TableCell>Requested Amount</TableCell>
                    <TableCell>Purpose</TableCell>
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
                    {isAdmin && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {creditlines.map((creditline) => (
                    <TableRow key={creditline.id || `${creditline.creditline}-${creditline.start_date}`}>
                      <TableCell>{data.account || "-"}</TableCell>
                      <TableCell>{creditline.creditline || "-"}</TableCell>
                      <TableCell>
                        {creditline.application ? (
                          <Chip
                            size="small"
                            label={creditline.application.status || "SUBMITTED"}
                            color={applicationStatusColor(creditline.application.status)}
                          />
                        ) : "-"}
                      </TableCell>
                      <TableCell>{creditline.application ? fmtMoney(creditline.application.amount_requested) : "-"}</TableCell>
                      <TableCell>{creditline.application?.purpose || "-"}</TableCell>
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
                      {isAdmin && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<EditIcon fontSize="small" />}
                              onClick={() => openCreditlineEditor(creditline)}
                            >
                              Edit
                            </Button>
                            <Tooltip title="Delete creditline">
                              <span>
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  startIcon={<DeleteOutlineIcon fontSize="small" />}
                                  onClick={() => openDeleteDialog(creditline)}
                                >
                                  Delete
                                </Button>
                              </span>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      )}
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

      <Dialog
        open={creditlineEditOpen}
        onClose={() => !savingCreditline && setCreditlineEditOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Edit Creditline</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Alert severity="warning">
              Editing a creditline changes client financial data. A verification code must be sent to the admin email and entered before saving.
            </Alert>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                fullWidth
                label="Verification Code"
                value={editVerificationCode}
                onChange={(e) => setEditVerificationCode(e.target.value)}
                helperText="Enter the code sent to the admin email."
              />
              <Button
                variant="outlined"
                onClick={() => sendAdminVerificationCode("edit_creditline", creditlineDraft?.current_creditline || creditlineDraft?.creditline, setSendingEditCode)}
                disabled={sendingEditCode || !creditlineDraft?.current_creditline}
                sx={{ minWidth: { xs: "100%", sm: 180 } }}
              >
                {sendingEditCode ? "Sending..." : "Send Code"}
              </Button>
            </Stack>
          </Stack>
          <Grid container spacing={2} sx={{ mt: 0.25 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Creditline"
                value={creditlineDraft?.creditline || ""}
                onChange={(e) => updateCreditlineField("creditline", e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Start Date"
                value={creditlineDraft?.start_date || ""}
                onChange={(e) => updateCreditlineField("start_date", e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Outstanding" value={creditlineDraft?.outstanding || ""} onChange={(e) => updateCreditlineField("outstanding", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Payment Plan" value={creditlineDraft?.payment_plan || ""} onChange={(e) => updateCreditlineField("payment_plan", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Principal Arrears" value={creditlineDraft?.principal_arrears || ""} onChange={(e) => updateCreditlineField("principal_arrears", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Interest Arrears" value={creditlineDraft?.interest_arrears || ""} onChange={(e) => updateCreditlineField("interest_arrears", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Interest Rate" value={creditlineDraft?.interest_rate || ""} onChange={(e) => updateCreditlineField("interest_rate", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Days in Arrears" value={creditlineDraft?.days_in_arrears || ""} onChange={(e) => updateCreditlineField("days_in_arrears", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Duration" value={creditlineDraft?.duration || ""} onChange={(e) => updateCreditlineField("duration", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Remaining Period" value={creditlineDraft?.remaining_period || ""} onChange={(e) => updateCreditlineField("remaining_period", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Periodicity" value={creditlineDraft?.periodicity || ""} onChange={(e) => updateCreditlineField("periodicity", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Class Value" value={creditlineDraft?.class_value || ""} onChange={(e) => updateCreditlineField("class_value", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Compulsory Saving" value={creditlineDraft?.compulsory_saving || ""} onChange={(e) => updateCreditlineField("compulsory_saving", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Voluntary Saving" value={creditlineDraft?.voluntary_saving || ""} onChange={(e) => updateCreditlineField("voluntary_saving", e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Salary" value={creditlineDraft?.salary || ""} onChange={(e) => updateCreditlineField("salary", e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreditlineEditOpen(false);
              setEditVerificationCode("");
            }}
            disabled={savingCreditline}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={saveCreditline} disabled={savingCreditline}>
            {savingCreditline ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deletingCreditline && setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Creditline</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Alert severity="warning">
              Deleting a creditline permanently removes its financial record. A verification code must be entered to confirm this action.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Delete creditline <b>{deleteTarget?.creditline || "-"}</b>? This cannot be undone.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                fullWidth
                label="Verification Code"
                value={deleteVerificationCode}
                onChange={(e) => setDeleteVerificationCode(e.target.value)}
                helperText="Enter the code sent to the admin email."
              />
              <Button
                variant="outlined"
                onClick={() => sendAdminVerificationCode("delete_creditline", deleteTarget?.creditline, setSendingDeleteCode)}
                disabled={sendingDeleteCode || !deleteTarget?.creditline}
                sx={{ minWidth: { xs: "100%", sm: 180 } }}
              >
                {sendingDeleteCode ? "Sending..." : "Send Code"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteTarget(null);
              setDeleteVerificationCode("");
            }}
            disabled={deletingCreditline}
          >
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={deleteCreditline} disabled={deletingCreditline}>
            {deletingCreditline ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
