"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  CheckCircle2,
  CircleDashed,
  Sparkles,
} from "lucide-react";
import {
  createBugReport,
  updateBugReport,
  toggleBugSolved,
  toggleBugAiFix,
  deleteBugReport,
} from "@/actions/bug-reports";
import { BUG_AREAS, bugAreaLabel } from "@/lib/bug-areas";
import { cn, formatNzDateTime } from "@/lib/utils";

type Bug = {
  id: string;
  description: string;
  affectedAreas: string[];
  driveLink: string | null;
  reporter: string | null;
  solved: boolean;
  resolvedAt: string | null;
  aiFix: boolean;
  aiFlaggedAt: string | null;
  createdAt: string;
};

type Filter = "open" | "solved" | "ai" | "all";

const EMPTY_DRAFT = {
  description: "",
  affectedAreas: [] as string[],
  driveLink: "",
  reporter: "",
};

export function BugTracker({ bugs }: { bugs: Bug[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const counts = useMemo(
    () => ({
      open: bugs.filter((b) => !b.solved).length,
      solved: bugs.filter((b) => b.solved).length,
      ai: bugs.filter((b) => b.aiFix && !b.solved).length,
      all: bugs.length,
    }),
    [bugs],
  );

  const visible = useMemo(() => {
    if (filter === "open") return bugs.filter((b) => !b.solved);
    if (filter === "solved") return bugs.filter((b) => b.solved);
    if (filter === "ai") return bugs.filter((b) => b.aiFix && !b.solved);
    return bugs;
  }, [bugs, filter]);

  function openNewBug() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }

  function openEditBug(bug: Bug) {
    setEditingId(bug.id);
    setDraft({
      description: bug.description,
      affectedAreas: bug.affectedAreas,
      driveLink: bug.driveLink ?? "",
      reporter: bug.reporter ?? "",
    });
    setDialogOpen(true);
  }

  function toggleArea(key: string) {
    setDraft((d) => {
      const has = d.affectedAreas.includes(key);
      return {
        ...d,
        affectedAreas: has
          ? d.affectedAreas.filter((k) => k !== key)
          : [...d.affectedAreas, key],
      };
    });
  }

  function submitDraft() {
    if (!draft.description.trim()) {
      toast.error("Add a description first");
      return;
    }
    start(async () => {
      const payload = {
        description: draft.description,
        affectedAreas: draft.affectedAreas,
        driveLink: draft.driveLink || null,
        reporter: draft.reporter || null,
      };
      const res = editingId
        ? await updateBugReport({ id: editingId, ...payload })
        : await createBugReport(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editingId ? "Bug updated" : "Bug logged");
      setDialogOpen(false);
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
      router.refresh();
    });
  }

  function onToggleSolved(bug: Bug) {
    start(async () => {
      const res = await toggleBugSolved({ id: bug.id, solved: !bug.solved });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(bug.solved ? "Reopened" : "Marked solved");
      router.refresh();
    });
  }

  function onToggleAiFix(bug: Bug) {
    start(async () => {
      const res = await toggleBugAiFix({ id: bug.id, aiFix: !bug.aiFix });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(bug.aiFix ? "Removed from AI queue" : "Flagged for AI to fix");
      router.refresh();
    });
  }

  function onDelete(bug: Bug) {
    if (!confirm(`Delete this bug? ${bug.description.slice(0, 60)}…`)) return;
    start(async () => {
      const res = await deleteBugReport({ id: bug.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Header: counts + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "open"} onClick={() => setFilter("open")}>
          Open <span className="ml-1.5 opacity-70">{counts.open}</span>
        </FilterChip>
        <FilterChip
          active={filter === "solved"}
          onClick={() => setFilter("solved")}
        >
          Solved <span className="ml-1.5 opacity-70">{counts.solved}</span>
        </FilterChip>
        <FilterChip
          active={filter === "ai"}
          onClick={() => setFilter("ai")}
          tone="ai"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Flagged for AI
          <span className="ml-1.5 opacity-80">{counts.ai}</span>
        </FilterChip>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="ml-1.5 opacity-70">{counts.all}</span>
        </FilterChip>
        <div className="grow" />
        <Button onClick={openNewBug} disabled={pending}>
          <Plus className="h-4 w-4 mr-1" /> New bug
        </Button>
      </div>

      {/* Bug list */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "open" && counts.all === 0
              ? "No bugs logged yet. Click \"New bug\" to add the first one."
              : filter === "open"
                ? "No open bugs — nice."
                : filter === "solved"
                  ? "Nothing marked solved yet."
                  : "No bugs to show."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((bug) => (
            <BugRow
              key={bug.id}
              bug={bug}
              onToggleSolved={() => onToggleSolved(bug)}
              onToggleAiFix={() => onToggleAiFix(bug)}
              onEdit={() => openEditBug(bug)}
              onDelete={() => onDelete(bug)}
              disabled={pending}
            />
          ))}
        </div>
      )}

      {/* Dialog: new / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit bug" : "Log a bug"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bug-desc">Description</Label>
              <Textarea
                id="bug-desc"
                rows={4}
                placeholder="What went wrong? Steps to reproduce, expected vs actual, etc."
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Affected areas</Label>
              <p className="text-xs text-muted-foreground">
                Tick every screen or feature this bug touches.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-md border p-3">
                {BUG_AREAS.map((a) => {
                  const checked = draft.affectedAreas.includes(a.key);
                  return (
                    <label
                      key={a.key}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm select-none",
                        "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={checked}
                        onChange={() => toggleArea(a.key)}
                      />
                      <span>{a.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bug-drive">Google Drive link (optional)</Label>
                <Input
                  id="bug-drive"
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={draft.driveLink}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, driveLink: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  A folder, doc, or file with screenshots / recordings.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bug-reporter">Reporter (optional)</Label>
                <Input
                  id="bug-reporter"
                  placeholder="e.g. son, tester, you"
                  value={draft.reporter}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, reporter: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Who logged this — leave blank if obvious.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submitDraft} disabled={pending}>
              {pending ? "Saving…" : editingId ? "Save changes" : "Log bug"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "ai";
}) {
  const baseInactive =
    tone === "ai"
      ? "bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900 hover:bg-violet-100 dark:hover:bg-violet-950/40"
      : "bg-background hover:bg-muted";
  const baseActive =
    tone === "ai"
      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-transparent shadow-sm shadow-violet-500/30"
      : "bg-primary text-primary-foreground border-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
        active ? baseActive : baseInactive,
      )}
    >
      {children}
    </button>
  );
}

function BugRow({
  bug,
  onToggleSolved,
  onToggleAiFix,
  onEdit,
  onDelete,
  disabled,
}: {
  bug: Bug;
  onToggleSolved: () => void;
  onToggleAiFix: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  // An *active* AI flag = flagged AND not yet solved. Once solved, the flag
  // is historical only — we keep the timestamp but don't draw attention to it.
  const aiActive = bug.aiFix && !bug.solved;

  return (
    <Card
      className={cn(
        "transition-all",
        bug.solved && "bg-muted/40 border-muted",
        aiActive &&
          "border-violet-300 dark:border-violet-800 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_8px_24px_-8px_rgba(139,92,246,0.25)] bg-gradient-to-r from-violet-50/60 to-transparent dark:from-violet-950/20",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Left: two stacked tickboxes — solved + AI-fix */}
          <div className="flex flex-col items-center gap-1.5 mt-0.5 shrink-0">
            <button
              type="button"
              onClick={onToggleSolved}
              disabled={disabled}
              className="rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label={bug.solved ? "Mark as open" : "Mark as solved"}
              title={bug.solved ? "Mark as open" : "Mark as solved"}
            >
              {bug.solved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <CircleDashed className="h-5 w-5" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleAiFix}
              disabled={disabled}
              className={cn(
                "group relative h-7 w-7 rounded-full inline-flex items-center justify-center transition-all",
                aiActive
                  ? "bg-gradient-to-br from-violet-500 via-violet-600 to-fuchsia-600 ring-2 ring-violet-200 dark:ring-violet-900 shadow-md shadow-violet-500/40 hover:scale-105"
                  : "ring-1 ring-dashed ring-violet-300/70 dark:ring-violet-800 text-violet-400 dark:text-violet-600 hover:ring-violet-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30",
              )}
              aria-label={
                bug.aiFix
                  ? "Remove AI-fix flag"
                  : "Flag this bug for the AI to fix"
              }
              title={
                bug.aiFix
                  ? "Flagged for AI to fix — click to unflag"
                  : "Flag this bug for the AI to fix"
              }
            >
              <Sparkles
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  aiActive && "text-white drop-shadow-sm group-hover:rotate-12",
                )}
              />
            </button>
          </div>

          {/* Middle: description + meta */}
          <div className="grow min-w-0 space-y-2">
            <div
              className={cn(
                "text-sm whitespace-pre-wrap break-words",
                bug.solved && "line-through opacity-70",
              )}
            >
              {bug.description}
            </div>

            <div className="flex flex-wrap gap-1">
              {aiActive && (
                <Badge
                  className="text-xs bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-transparent hover:from-violet-700 hover:to-fuchsia-700"
                  title={
                    bug.aiFlaggedAt
                      ? `Flagged ${formatNzDateTime(bug.aiFlaggedAt)}`
                      : undefined
                  }
                >
                  <Sparkles className="h-3 w-3 mr-1" /> AI to fix
                </Badge>
              )}
              {bug.affectedAreas.map((key) => (
                <Badge key={key} variant="secondary" className="text-xs">
                  {bugAreaLabel(key)}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span title={bug.createdAt}>
                Logged {formatNzDateTime(bug.createdAt)}
              </span>
              {bug.reporter && <span>by {bug.reporter}</span>}
              {bug.solved && bug.resolvedAt && (
                <span className="text-emerald-700">
                  · solved {formatNzDateTime(bug.resolvedAt)}
                </span>
              )}
              {aiActive && bug.aiFlaggedAt && (
                <span className="text-violet-700 dark:text-violet-300">
                  · flagged for AI {formatNzDateTime(bug.aiFlaggedAt)}
                </span>
              )}
              {bug.driveLink && (
                <a
                  href={bug.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" /> Drive
                </a>
              )}
            </div>
          </div>

          {/* Right: edit / delete */}
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              disabled={disabled}
              aria-label="Edit"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={disabled}
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
