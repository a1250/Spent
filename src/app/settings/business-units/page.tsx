"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Building2,
  ChevronRight,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SectionShell } from "@/components/settings/section-shell";
import {
  createBusinessUnit,
  listBusinessUnits,
  updateBusinessUnit,
} from "@/lib/api";
import type { BusinessUnitRecord } from "@/lib/types";

const RESERVED_SLUGS = new Set(["unknown", "other", "personal"]);

const PALETTE = [
  "#A2ABBB",
  "#7D90CA",
  "#E7A875",
  "#7BB36B",
  "#8BBBB8",
  "#E499A4",
  "#65C1D1",
  "#D692BF",
  "#C0D582",
  "#9186D1",
  "#DBC27F",
  "#A4C386",
] as const;

function pickDefaultColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function BusinessUnitsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: units } = useQuery({
    queryKey: ["businessUnits", { includeInactive: true, includeCounts: true }],
    queryFn: () =>
      listBusinessUnits({ includeInactive: true, includeCounts: true }),
  });

  const activeUnits = units?.filter((u) => u.isActive) ?? [];
  const inactiveUnits = units?.filter((u) => !u.isActive) ?? [];
  const inactiveCount = inactiveUnits.length;

  const displayed = showInactive ? inactiveUnits : activeUnits;
  const selectedUnit = units?.find((u) => u.id === openId) ?? null;

  return (
    <>
      <SectionShell
        title="Business Units"
        description="Tag transactions by business or project. The slug is permanent and maps to existing transaction data."
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              showInactive
                ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="h-3 w-3" />
            Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
          </button>
          {!showInactive && <NewUnitDialog />}
        </div>

        {!units ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {showInactive ? "No inactive business units." : "No business units yet."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {displayed.map((unit) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  onSelect={() => setOpenId(unit.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </SectionShell>

      <BusinessUnitSheet
        unit={selectedUnit}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function UnitRow({
  unit,
  onSelect,
}: {
  unit: BusinessUnitRecord;
  onSelect: () => void;
}) {
  const isReserved = RESERVED_SLUGS.has(unit.slug);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: unit.color ?? "#9ca3af" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{unit.label}</span>
            {isReserved && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                reserved
              </span>
            )}
            {!unit.isActive && (
              <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                inactive
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{unit.slug}</span>
            {unit.txCount != null && unit.txCount > 0 && (
              <span className="ml-2">· {unit.txCount.toLocaleString()} tx</span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
      </button>
    </li>
  );
}

function BusinessUnitSheet({
  unit,
  onClose,
}: {
  unit: BusinessUnitRecord | null;
  onClose: () => void;
}) {
  const open = unit !== null;
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["businessUnits"] });

  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [labelDirty, setLabelDirty] = useState(false);
  const [descDirty, setDescDirty] = useState(false);
  const [colorDirty, setColorDirty] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (unit) {
      setEditLabel(unit.label);
      setEditDesc(unit.description ?? "");
      setSelectedColor(unit.color ?? "#9ca3af");
      setLabelDirty(false);
      setDescDirty(false);
      setColorDirty(false);
    }
  }, [unit]);

  const saveMutation = useMutation({
    mutationFn: (patch: {
      label?: string;
      description?: string | null;
      color?: string | null;
    }) => updateBusinessUnit(unit!.id, patch),
    onSuccess: () => {
      invalidate();
      setLabelDirty(false);
      setDescDirty(false);
      setColorDirty(false);
    },
    onError: () => toast.error("Failed to save"),
  });

  const archiveMutation = useMutation({
    mutationFn: (active: boolean) =>
      updateBusinessUnit(unit!.id, { isActive: active }),
    onSuccess: (_, active) => {
      invalidate();
      toast.success(active ? "Restored" : "Deactivated");
      onClose();
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to update"),
  });

  function handleLabelSave() {
    const trimmed = editLabel.trim();
    if (!trimmed || trimmed === unit?.label) {
      setEditLabel(unit?.label ?? "");
      setLabelDirty(false);
      return;
    }
    saveMutation.mutate({ label: trimmed });
  }

  function handleDescSave() {
    const trimmed = editDesc.trim() || null;
    if (trimmed === (unit?.description ?? null)) {
      setDescDirty(false);
      return;
    }
    saveMutation.mutate({ description: trimmed });
  }

  function handleColorSave(color: string) {
    if (color === unit?.color) return;
    saveMutation.mutate({ color });
  }

  if (!unit) return null;

  const isReserved = RESERVED_SLUGS.has(unit.slug);
  const canDeactivate = unit.isActive && !isReserved;
  const canActivate = !unit.isActive;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-full shrink-0"
                style={{ background: unit.color ?? "#9ca3af" }}
              />
              <div className="min-w-0">
                <SheetTitle className="text-base leading-tight">{unit.label}</SheetTitle>
                <SheetDescription className="font-mono text-xs mt-0.5">
                  {unit.slug}
                </SheetDescription>
              </div>
              {isReserved && (
                <span className="ms-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  reserved
                </span>
              )}
            </div>
            {unit.txCount != null && (
              <p className="mt-2 text-xs text-muted-foreground">
                <Building2 className="inline h-3 w-3 mb-0.5 me-1 opacity-60" />
                {unit.txCount.toLocaleString()} transaction{unit.txCount !== 1 ? "s" : ""}
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Label */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Label</h3>
              <div className="flex gap-2">
                <Input
                  ref={labelRef}
                  value={editLabel}
                  onChange={(e) => {
                    setEditLabel(e.target.value);
                    setLabelDirty(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLabelSave();
                    if (e.key === "Escape") {
                      setEditLabel(unit.label);
                      setLabelDirty(false);
                    }
                  }}
                  onBlur={handleLabelSave}
                  className="flex-1"
                />
                {labelDirty && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditLabel(unit.label);
                      setLabelDirty(false);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                The slug <span className="font-mono">{unit.slug}</span> is permanent and cannot be changed.
              </p>
            </section>

            {/* Description */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Description</h3>
              <textarea
                value={editDesc}
                onChange={(e) => {
                  setEditDesc(e.target.value);
                  setDescDirty(true);
                }}
                onBlur={handleDescSave}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditDesc(unit.description ?? "");
                    setDescDirty(false);
                  }
                }}
                placeholder="Optional note about this business unit…"
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </section>

            {/* Color */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Color</h3>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setSelectedColor(c);
                      handleColorSave(c);
                    }}
                    className={`h-6 w-6 rounded-full transition-all ${
                      selectedColor === c
                        ? "ring-2 ring-foreground ring-offset-2"
                        : "opacity-70 hover:opacity-100"
                    }`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </section>

            {/* Archive / Restore */}
            <section className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
              <h3 className="text-sm font-medium">
                {unit.isActive ? "Deactivate" : "Restore"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {unit.isActive
                  ? "Inactive units are hidden from pickers. Existing transactions are not affected."
                  : "Restore this unit to make it available in pickers again."}
              </p>
              {isReserved && unit.isActive ? (
                <p className="text-xs text-muted-foreground italic">
                  Reserved units cannot be deactivated.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant={unit.isActive ? "outline" : "default"}
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate(!unit.isActive)}
                  className="gap-1.5"
                >
                  {unit.isActive ? (
                    <>
                      <Archive className="h-3.5 w-3.5" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      Restore
                    </>
                  )}
                </Button>
              )}
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewUnitDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [slugManual, setSlugManual] = useState(false);

  function deriveSlug(lbl: string) {
    return lbl
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  function handleLabelChange(val: string) {
    setLabel(val);
    if (!slugManual) setSlug(deriveSlug(val));
  }

  const mutation = useMutation({
    mutationFn: () =>
      createBusinessUnit({
        slug: slug.trim(),
        label: label.trim(),
        description: description.trim() || null,
        color,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["businessUnits"] });
      toast.success(`Created "${label.trim()}"`);
      resetForm();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create");
    },
  });

  function resetForm() {
    setLabel("");
    setSlug("");
    setDescription("");
    setColor(PALETTE[0]);
    setSlugManual(false);
  }

  const valid = label.trim().length > 0 && /^[a-z0-9-]+$/.test(slug.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add unit
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New business unit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bu-label">Label</Label>
            <Input
              id="bu-label"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. My Project"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bu-slug">
              Slug{" "}
              <span className="text-muted-foreground font-normal">(permanent)</span>
            </Label>
            <Input
              id="bu-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSlugManual(true);
              }}
              placeholder="e.g. my-project"
              className="font-mono"
            />
            {slug && !/^[a-z0-9-]+$/.test(slug) && (
              <p className="text-xs text-destructive">
                Only lowercase letters, numbers, and hyphens.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bu-desc">Description (optional)</Label>
            <Input
              id="bu-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full transition-all ${
                    color === c
                      ? "ring-2 ring-foreground ring-offset-2"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
