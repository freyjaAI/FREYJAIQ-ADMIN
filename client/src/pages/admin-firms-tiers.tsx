import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Building2,
  Layers,
  Plus,
  Pencil,
  Copy,
  Check,
  RefreshCw,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Tier, Firm } from "@shared/schema";

interface FirmWithUsage extends Firm {
  tierName: string | null;
  monthlyFirmCallLimit: number | null;
  monthlyUserCallLimit: number | null;
  monthlyCallsUsed: number;
}

function TiersTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    monthlyFirmCallLimit: "",
    monthlyUserCallLimit: "",
    isActive: true,
  });

  const { data: tiers, isLoading } = useQuery<Tier[]>({
    queryKey: ["/api/admin/tiers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/tiers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: "Tier created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tier", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/tiers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tiers"] });
      setEditingTier(null);
      resetForm();
      toast({ title: "Tier updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tier", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      monthlyFirmCallLimit: "",
      monthlyUserCallLimit: "",
      isActive: true,
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description || null,
      monthlyFirmCallLimit: formData.monthlyFirmCallLimit ? parseInt(formData.monthlyFirmCallLimit) : null,
      monthlyUserCallLimit: formData.monthlyUserCallLimit ? parseInt(formData.monthlyUserCallLimit) : null,
      isActive: formData.isActive,
    });
  };

  const handleUpdate = () => {
    if (!editingTier) return;
    updateMutation.mutate({
      id: editingTier.id,
      data: {
        name: formData.name,
        description: formData.description || null,
        monthlyFirmCallLimit: formData.monthlyFirmCallLimit ? parseInt(formData.monthlyFirmCallLimit) : null,
        monthlyUserCallLimit: formData.monthlyUserCallLimit ? parseInt(formData.monthlyUserCallLimit) : null,
        isActive: formData.isActive,
      },
    });
  };

  const openEdit = (tier: Tier) => {
    setEditingTier(tier);
    setFormData({
      name: tier.name,
      description: tier.description || "",
      monthlyFirmCallLimit: tier.monthlyFirmCallLimit?.toString() || "",
      monthlyUserCallLimit: tier.monthlyUserCallLimit?.toString() || "",
      isActive: tier.isActive,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Subscription Tiers</h3>
          <p className="text-sm text-muted-foreground">Define API call limits per tier</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-tier">
          <Plus className="mr-2 h-4 w-4" />
          Create Tier
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Firm Limit/mo</TableHead>
              <TableHead className="text-right">User Limit/mo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers?.map((tier) => (
              <TableRow key={tier.id} data-testid={`row-tier-${tier.id}`}>
                <TableCell className="font-medium">{tier.name}</TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {tier.description || "-"}
                </TableCell>
                <TableCell className="text-right">
                  {tier.monthlyFirmCallLimit?.toLocaleString() || "Unlimited"}
                </TableCell>
                <TableCell className="text-right">
                  {tier.monthlyUserCallLimit?.toLocaleString() || "Unlimited"}
                </TableCell>
                <TableCell>
                  <Badge variant={tier.isActive ? "default" : "secondary"}>
                    {tier.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(tier)}
                    data-testid={`button-edit-tier-${tier.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!tiers || tiers.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No tiers configured. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isCreateOpen || !!editingTier} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingTier(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTier ? "Edit Tier" : "Create Tier"}</DialogTitle>
            <DialogDescription>
              {editingTier ? "Update tier settings" : "Define a new subscription tier"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Tier 1, Enterprise"
                data-testid="input-tier-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                data-testid="input-tier-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firmLimit">Monthly Firm Limit</Label>
                <Input
                  id="firmLimit"
                  type="number"
                  value={formData.monthlyFirmCallLimit}
                  onChange={(e) => setFormData({ ...formData, monthlyFirmCallLimit: e.target.value })}
                  placeholder="Leave empty for unlimited"
                  data-testid="input-tier-firm-limit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userLimit">Monthly User Limit</Label>
                <Input
                  id="userLimit"
                  type="number"
                  value={formData.monthlyUserCallLimit}
                  onChange={(e) => setFormData({ ...formData, monthlyUserCallLimit: e.target.value })}
                  placeholder="Leave empty for unlimited"
                  data-testid="input-tier-user-limit"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-tier-active"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateOpen(false);
              setEditingTier(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={editingTier ? handleUpdate : handleCreate}
              disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-tier"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingTier ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FirmsTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFirm, setEditingFirm] = useState<FirmWithUsage | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    tierId: "",
    externalId: "",
    notes: "",
  });

  const { data: firms, isLoading: firmsLoading } = useQuery<FirmWithUsage[]>({
    queryKey: ["/api/admin/firms"],
  });

  const { data: tiers } = useQuery<Tier[]>({
    queryKey: ["/api/admin/tiers"],
  });

  const activeTiers = tiers?.filter(t => t.isActive) || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/firms", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/firms"] });
      setIsCreateOpen(false);
      resetForm();
      toast({
        title: "Firm created successfully",
        description: `Signup code: ${data.signupCode}`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create firm", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/firms/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/firms"] });
      setEditingFirm(null);
      resetForm();
      toast({ title: "Firm updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update firm", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      tierId: "",
      externalId: "",
      notes: "",
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      tierId: formData.tierId || null,
      externalId: formData.externalId || null,
      notes: formData.notes || null,
    });
  };

  const handleUpdate = (regenerateCode = false) => {
    if (!editingFirm) return;
    updateMutation.mutate({
      id: editingFirm.id,
      data: {
        name: formData.name,
        tierId: formData.tierId || null,
        externalId: formData.externalId || null,
        notes: formData.notes || null,
        regenerateCode,
      },
    });
  };

  const openEdit = (firm: FirmWithUsage) => {
    setEditingFirm(firm);
    setFormData({
      name: firm.name,
      tierId: firm.tierId || "",
      externalId: firm.externalId || "",
      notes: firm.notes || "",
    });
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  if (firmsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Client Firms</h3>
          <p className="text-sm text-muted-foreground">Manage contracted companies</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-firm">
          <Plus className="mr-2 h-4 w-4" />
          Create Firm
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Signup Code</TableHead>
              <TableHead>Monthly Usage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {firms?.map((firm) => {
              const usagePercent = firm.monthlyFirmCallLimit
                ? Math.min((firm.monthlyCallsUsed / firm.monthlyFirmCallLimit) * 100, 100)
                : 0;
              return (
                <TableRow key={firm.id} data-testid={`row-firm-${firm.id}`}>
                  <TableCell className="font-medium">{firm.name}</TableCell>
                  <TableCell>
                    {firm.tierName ? (
                      <Badge variant="outline">{firm.tierName}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                        {firm.signupCode}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(firm.signupCode)}
                        data-testid={`button-copy-code-${firm.id}`}
                      >
                        {copiedCode === firm.signupCode ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 min-w-[150px]">
                      <div className="flex items-center justify-between text-sm">
                        <span>{firm.monthlyCallsUsed.toLocaleString()}</span>
                        <span className="text-muted-foreground">
                          / {firm.monthlyFirmCallLimit?.toLocaleString() || "Unlimited"}
                        </span>
                      </div>
                      {firm.monthlyFirmCallLimit && (
                        <Progress value={usagePercent} className="h-2" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(firm)}
                      data-testid={`button-edit-firm-${firm.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {(!firms || firms.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No firms configured. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isCreateOpen || !!editingFirm} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingFirm(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFirm ? "Edit Firm" : "Create Firm"}</DialogTitle>
            <DialogDescription>
              {editingFirm ? "Update firm settings" : "Add a new client firm"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="firmName">Name</Label>
              <Input
                id="firmName"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Company name"
                data-testid="input-firm-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tier">Tier</Label>
              <Select
                value={formData.tierId}
                onValueChange={(value) => setFormData({ ...formData, tierId: value })}
              >
                <SelectTrigger id="tier" data-testid="select-firm-tier">
                  <SelectValue placeholder="Select a tier" />
                </SelectTrigger>
                <SelectContent>
                  {activeTiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="externalId">External ID (CRM)</Label>
              <Input
                id="externalId"
                value={formData.externalId}
                onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                placeholder="Optional CRM reference"
                data-testid="input-firm-external-id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes..."
                data-testid="input-firm-notes"
              />
            </div>
            {editingFirm && (
              <div className="rounded-md bg-muted p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Current Signup Code</span>
                  <div className="flex items-center gap-2">
                    <code className="bg-background px-2 py-1 rounded text-sm font-mono">
                      {editingFirm.signupCode}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdate(true)}
                      disabled={updateMutation.isPending}
                      data-testid="button-regenerate-code"
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateOpen(false);
              setEditingFirm(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => editingFirm ? handleUpdate(false) : handleCreate()}
              disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-firm"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingFirm ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminFirmsTiers() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
          <Building2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Firms & Tiers</h1>
          <p className="text-muted-foreground">Manage client firms and subscription tiers</p>
        </div>
      </div>

      <Tabs defaultValue="firms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="firms" className="gap-2" data-testid="tab-firms">
            <Users className="h-4 w-4" />
            Firms
          </TabsTrigger>
          <TabsTrigger value="tiers" className="gap-2" data-testid="tab-tiers">
            <Layers className="h-4 w-4" />
            Tiers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="firms">
          <FirmsTab />
        </TabsContent>
        <TabsContent value="tiers">
          <TiersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
