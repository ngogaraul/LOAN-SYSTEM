import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { getAuth } from "../auth/auth";

import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Menu,
  MenuItem,
  TableContainer,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";

function statusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "success";
  if (s === "SUSPENDED") return "warning";
  if (s === "CLOSED") return "default";
  return "default";
}

export default function Clients() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const role = (getAuth()?.role || "ANALYST").toUpperCase();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);

  const [delOpen, setDelOpen] = useState(false);
  const [delRow, setDelRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuClient, setMenuClient] = useState(null);

  async function load(targetPage = page) {
    setLoading(true);
    try {
      const res = await api.get("/clients", {
        params: {
          search: search.trim() || undefined,
          page: targetPage,
          page_size: pageSize,
        },
      });

      setItems(res.data.items || []);
      setPage(res.data.page || 1);
      setTotal(res.data.total || 0);
    } catch {
      enqueueSnackbar("Failed to load clients.", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDelete(c) {
    setDelRow(c);
    setDelOpen(true);
  }

  async function confirmDelete() {
    if (!delRow) return;
    setDeleting(true);
    try {
      await api.delete(`/clients/${delRow.id}`);
      enqueueSnackbar("Client deleted.", { variant: "success" });
      setDelOpen(false);
      await load(page);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Delete failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  function openStatusMenu(e, c) {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuClient(c);
  }

  function closeStatusMenu() {
    setMenuAnchor(null);
    setMenuClient(null);
  }

  async function setStatus(newStatus) {
    if (!menuClient) return;
    try {
      await api.patch(`/clients/${menuClient.id}/status`, { status: newStatus });
      enqueueSnackbar(`Status updated to ${newStatus}.`, { variant: "success" });
      closeStatusMenu();
      await load(page);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Status update failed";
      enqueueSnackbar(msg, { variant: "error" });
    }
  }

  function totalPages() {
    return Math.max(1, Math.ceil(total / pageSize));
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
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Clients</Typography>
        </Box>
        <Chip label={`${total} total`} color="primary" variant="outlined" />
      </Stack>

      <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Search"
            placeholder="ACC001 / John"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={() => load(1)}
            disabled={loading}
          >
            {loading ? "Loading..." : "Search"}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        {isMobile ? (
          items.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">No clients found.</Typography>
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ p: 1.5 }}>
              {items.map((c) => (
                <Paper
                  key={c.id}
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
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <Stack spacing={1.2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {c.account}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {c.full_name}
                        </Typography>
                      </Box>
                      <Chip size="small" label={c.status || "ACTIVE"} color={statusColor(c.status)} />
                    </Stack>

                    <Typography variant="body2">{c.phone || "-"}</Typography>

                    <Stack direction="row" justifyContent="flex-end" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={role === "ADMIN" ? "Change status" : "Admin only"}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={role !== "ADMIN"}
                            onClick={(e) => openStatusMenu(e, c)}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={role === "ADMIN" ? "Delete client" : "Admin only"}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={role !== "ADMIN"}
                            onClick={() => openDelete(c)}
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
          )
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Full name</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {items.map((c) => (
                  <TableRow
                    key={c.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/clients/${c.id}`)}
                  >
                    <TableCell>{c.id}</TableCell>
                    <TableCell>{c.account}</TableCell>
                    <TableCell>{c.full_name}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell>
                      <Chip size="small" label={c.status || "ACTIVE"} color={statusColor(c.status)} />
                    </TableCell>

                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={role === "ADMIN" ? "Change status" : "Admin only"}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={role !== "ADMIN"}
                            onClick={(e) => openStatusMenu(e, c)}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title={role === "ADMIN" ? "Delete client" : "Admin only"}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={role !== "ADMIN"}
                            onClick={() => openDelete(c)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}

                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary" sx={{ p: 2 }}>
                        No clients found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ xs: "stretch", sm: "center" }}>
        <Button
          variant="outlined"
          disabled={page <= 1}
          onClick={() => load(page - 1)}
        >
          Prev
        </Button>

        <Typography>
          Page {page} of {totalPages()}
        </Typography>

        <Button
          variant="outlined"
          disabled={page >= totalPages()}
          onClick={() => load(page + 1)}
        >
          Next
        </Button>
      </Stack>

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeStatusMenu}
      >
        <MenuItem onClick={() => setStatus("ACTIVE")}>Set ACTIVE</MenuItem>
        <MenuItem onClick={() => setStatus("SUSPENDED")}>Set SUSPENDED</MenuItem>
        <MenuItem onClick={() => setStatus("CLOSED")}>Set CLOSED</MenuItem>
      </Menu>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Delete client?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete client <b>{delRow?.account}</b> ({delRow?.full_name})? This cannot be undone.
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
