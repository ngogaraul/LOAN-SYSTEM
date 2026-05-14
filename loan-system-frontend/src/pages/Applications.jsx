import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { getAuth } from "../auth/auth";

import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  MenuItem,
  Button,
  Stack,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TableContainer,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

const STATUSES = ["", "SUBMITTED", "SCORED", "REVIEW", "APPROVED", "REJECTED"];

function statusColor(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "REVIEW") return "warning";
  if (status === "SCORED") return "info";
  return "default";
}

function calculateTermMonths(amount, paymentPlan) {
  const parsedAmount = Number(amount);
  const parsedPaymentPlan = Number(paymentPlan);

  if (!parsedAmount || parsedAmount <= 0 || !parsedPaymentPlan || parsedPaymentPlan <= 0) {
    return "";
  }

  return String(Math.ceil(parsedAmount / parsedPaymentPlan));
}

export default function Applications() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const auth = getAuth();
  const role = auth?.role || "ANALYST";

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({ amount_requested: "", payment_plan: "", purpose: "", term_requested: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  const [delOpen, setDelOpen] = useState(false);
  const [delRow, setDelRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const rules = useMemo(() => ({
    canEdit: (row) => row?.status === "SUBMITTED",
    canDelete: (row) => {
      if (!row) return false;
      if (row.status === "APPROVED" || row.status === "REJECTED") return false;
      if (role === "ADMIN") return row.status === "SUBMITTED" || row.status === "SCORED";
      return row.status === "SUBMITTED";
    },
  }), [role]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();

      const res = await api.get("/applications", { params });
      setItems(res.data.items || []);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Failed to load applications";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status, page]); // eslint-disable-line

  function onSearch() {
    setPage(1);
    load();
  }

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      amount_requested: row.amount_requested ?? "",
      payment_plan: row.payment_plan ?? "",
      purpose: row.purpose ?? "",
      term_requested: calculateTermMonths(row.amount_requested, row.payment_plan) || (row.term_requested ?? ""),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;

    setSavingEdit(true);
    try {
      await api.put(`/applications/${editRow.id}`, {
        amount_requested: Number(editForm.amount_requested),
        payment_plan: Number(editForm.payment_plan),
        purpose: String(editForm.purpose || ""),
        term_requested: Number(editForm.term_requested),
      });
      enqueueSnackbar("Application updated.", { variant: "success" });
      setEditOpen(false);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSavingEdit(false);
    }
  }

  function openDelete(row) {
    setDelRow(row);
    setDelOpen(true);
  }

  async function confirmDelete() {
    if (!delRow) return;
    setDeleting(true);
    try {
      await api.delete(`/applications/${delRow.id}`);
      enqueueSnackbar("Application deleted.", { variant: "success" });
      setDelOpen(false);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Delete failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Applications</Typography>
        </Box>
        <Chip label={`${items.length} shown${status ? ` - ${status}` : ""}`} color="primary" variant="outlined" />
      </Stack>

      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            sx={{ minWidth: 180 }}
          >
            {STATUSES.map((item) => (
              <MenuItem key={item} value={item}>{item || "ALL"}</MenuItem>
            ))}
          </TextField>

          <TextField
            label="Search"
            placeholder="ACC001 / John / 7"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
          />

          <Button variant="contained" onClick={onSearch}>Search</Button>
        </Stack>

        {err && <Typography sx={{ mt: 2 }} color="error">{err}</Typography>}
      </Paper>

      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        {loading ? (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">No applications found.</Typography>
          </Box>
        ) : isMobile ? (
          <Stack spacing={1.5} sx={{ p: 1.5 }}>
            {items.map((application) => (
              <Paper
                key={application.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  cursor: "pointer",
                  transition: "transform 120ms ease, box-shadow 120ms ease",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: 3,
                  },
                }}
                onClick={() => navigate(`/applications/${application.id}`)}
              >
                <Stack spacing={1.2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        #{application.id} - {application.client?.account || "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {application.client?.full_name || "-"}
                      </Typography>
                    </Box>
                    <Chip size="small" label={application.status} color={statusColor(application.status)} />
                  </Stack>

                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Amount</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {Number(application.amount_requested || 0).toLocaleString()}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="caption" color="text.secondary">Submitted</Typography>
                      <Typography variant="body2">{application.submitted_at}</Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" justifyContent="flex-end" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={rules.canEdit(application) ? "Edit (SUBMITTED only)" : "Only SUBMITTED can be edited"}>
                      <span>
                        <IconButton size="small" disabled={!rules.canEdit(application)} onClick={() => openEdit(application)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>

                    <Tooltip title={rules.canDelete(application) ? "Delete" : "Delete not allowed"}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={!rules.canDelete(application)}
                          onClick={() => openDelete(application)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {items.map((application) => (
                  <TableRow
                    key={application.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/applications/${application.id}`)}
                  >
                    <TableCell>{application.id}</TableCell>
                    <TableCell>{application.client?.account || "-"}</TableCell>
                    <TableCell>{application.client?.full_name || "-"}</TableCell>
                    <TableCell>{Number(application.amount_requested || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip size="small" label={application.status} color={statusColor(application.status)} />
                    </TableCell>
                    <TableCell>{application.submitted_at}</TableCell>

                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={rules.canEdit(application) ? "Edit (SUBMITTED only)" : "Only SUBMITTED can be edited"}>
                        <span>
                          <IconButton size="small" disabled={!rules.canEdit(application)} onClick={() => openEdit(application)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={rules.canDelete(application) ? "Delete" : "Delete not allowed"}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={!rules.canDelete(application)}
                            onClick={() => openDelete(application)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ xs: "stretch", sm: "center" }}>
        <Button variant="outlined" disabled={page <= 1} onClick={() => setPage((currentPage) => currentPage - 1)}>Prev</Button>
        <Typography sx={{ px: { sm: 1 } }}>Page {page}</Typography>
        <Button
          variant="outlined"
          disabled={items.length < pageSize}
          onClick={() => setPage((currentPage) => currentPage + 1)}
        >
          Next
        </Button>
      </Stack>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Application</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Amount Requested"
              value={editForm.amount_requested}
              onChange={(e) => setEditForm((currentForm) => {
                const amountRequested = e.target.value;
                return {
                  ...currentForm,
                  amount_requested: amountRequested,
                  term_requested: calculateTermMonths(amountRequested, currentForm.payment_plan),
                };
              })}
            />
            <TextField
              label="Purpose"
              value={editForm.purpose}
              onChange={(e) => setEditForm((currentForm) => ({ ...currentForm, purpose: e.target.value }))}
            />
            <TextField
              label="Payment Plan"
              value={editForm.payment_plan}
              onChange={(e) => setEditForm((currentForm) => {
                const paymentPlan = e.target.value;
                return {
                  ...currentForm,
                  payment_plan: paymentPlan,
                  term_requested: calculateTermMonths(currentForm.amount_requested, paymentPlan),
                };
              })}
            />
            <TextField
              label="Term Requested (months)"
              value={editForm.term_requested}
              InputProps={{ readOnly: true }}
              helperText="Auto-calculated from Amount Requested and Payment Plan."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={savingEdit}>
            {savingEdit ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Delete Application?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete application #{delRow?.id}? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
