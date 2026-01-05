import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Users, 
  BarChart3, 
  Copy, 
  MoreHorizontal, 
  Shield, 
  ShieldCheck, 
  UserMinus,
  Loader2,
  AlertCircle,
  Link2,
  Check,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useState } from "react";

interface FirmUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: string | null;
  usage: number;
}

interface FirmUsersResponse {
  firmId: string;
  users: FirmUser[];
  period: string;
}

interface FirmSettings {
  firm: {
    id: string;
    name: string;
    signupCode: string;
    notes: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  tier: {
    id: string;
    name: string;
    monthlyFirmCallLimit: number | null;
    monthlyUserCallLimit: number | null;
  } | null;
  userCount: number;
}

interface FirmUsage {
  period: string;
  firm: {
    id: string;
    name: string;
    signupCode: string;
    tierName: string;
    monthlyFirmCallLimit: number | null;
    monthlyUserCallLimit: number | null;
  };
  firmUsage: number;
  firmUsagePercent: number | null;
  users: Array<{
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    usage: number;
    usagePercent: number | null;
  }>;
}

export default function FirmSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userToRemove, setUserToRemove] = useState<FirmUser | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data: settings, isLoading: settingsLoading, error: settingsError } = useQuery<FirmSettings>({
    queryKey: ["/api/firm/settings"],
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<FirmUsersResponse>({
    queryKey: ["/api/firm/users"],
  });

  const { data: usageData, isLoading: usageLoading } = useQuery<FirmUsage>({
    queryKey: ["/api/firm/usage"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/firm/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/users"] });
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update user role.",
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/firm/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm/settings"] });
      setUserToRemove(null);
      toast({
        title: "User Removed",
        description: "User has been removed from the firm.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to remove user.",
        variant: "destructive",
      });
    },
  });

  const copySignupCode = () => {
    if (settings?.firm.signupCode) {
      navigator.clipboard.writeText(settings.firm.signupCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      toast({
        title: "Copied",
        description: "Signup code copied to clipboard.",
      });
    }
  };
  
  const copyInviteLink = () => {
    if (settings?.firm.signupCode) {
      const inviteUrl = `${window.location.origin}/signup?code=${settings.firm.signupCode}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({
        title: "Copied",
        description: "Invitation link copied to clipboard.",
      });
    }
  };

  if (user?.role !== "firm_admin" && user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You need firm admin permissions to access this page.
          </p>
        </div>
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h2 className="text-xl font-semibold">Error Loading Firm Settings</h2>
          <p className="text-muted-foreground">
            {(settingsError as any)?.message || "Unable to load firm settings. Please try again."}
          </p>
        </div>
      </div>
    );
  }

  const getUserName = (u: FirmUser | { firstName: string | null; lastName: string | null; email: string }) => {
    if (u.firstName || u.lastName) {
      return `${u.firstName || ""} ${u.lastName || ""}`.trim();
    }
    return u.email;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold" data-testid="heading-firm-settings">Firm Settings</h1>
        <p className="text-muted-foreground">
          Manage your firm's users, usage, and settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Firm Information
          </CardTitle>
          <CardDescription>Your organization's details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : settings ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Firm Name</div>
                  <div className="font-medium" data-testid="text-firm-name">{settings.firm.name}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Subscription Tier</div>
                  <Badge data-testid="badge-tier-name">{settings.tier?.name || "No Tier"}</Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Signup Code</div>
                    <div className="text-sm text-muted-foreground">
                      Share this code with new team members to join your firm
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-3 py-1 rounded text-sm font-mono" data-testid="text-signup-code">
                      {settings.firm.signupCode}
                    </code>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={copySignupCode}
                      data-testid="button-copy-signup-code"
                    >
                      {copiedCode ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Invitation Link</div>
                    <div className="text-sm text-muted-foreground">
                      Share this link to invite new team members directly
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={copyInviteLink}
                    className="gap-2"
                    data-testid="button-copy-invite-link"
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
                    {copiedLink ? "Copied" : "Copy Link"}
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Total Users</div>
                  <div className="font-medium" data-testid="text-user-count">{settings.userCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Member Since</div>
                  <div className="font-medium">
                    {settings.firm.createdAt 
                      ? format(new Date(settings.firm.createdAt), "MMM d, yyyy")
                      : "N/A"}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage This Month
          </CardTitle>
          <CardDescription>
            {usageData?.period ? `Billing period: ${usageData.period}` : "Current billing period usage"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usageLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading usage...
            </div>
          ) : usageData ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Firm API Calls</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-firm-usage">
                    {usageData.firmUsage.toLocaleString()}
                    {usageData.firm.monthlyFirmCallLimit 
                      ? ` / ${usageData.firm.monthlyFirmCallLimit.toLocaleString()}`
                      : " (unlimited)"}
                  </span>
                </div>
                {usageData.firm.monthlyFirmCallLimit && (
                  <Progress 
                    value={usageData.firmUsagePercent || 0} 
                    className="h-2"
                    data-testid="progress-firm-usage"
                  />
                )}
              </div>
              <Separator />
              <div>
                <div className="text-sm font-medium mb-2">Limits</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Monthly Firm Limit</div>
                    <div className="font-medium">
                      {usageData.firm.monthlyFirmCallLimit?.toLocaleString() || "Unlimited"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Per-User Limit</div>
                    <div className="font-medium">
                      {usageData.firm.monthlyUserCallLimit?.toLocaleString() || "Unlimited"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </CardTitle>
          <CardDescription>Manage users in your firm</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users...
            </div>
          ) : usersData?.users && usersData.users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Usage This Month</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData.users.map((firmUser) => (
                  <TableRow key={firmUser.id} data-testid={`row-user-${firmUser.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{getUserName(firmUser)}</div>
                        <div className="text-sm text-muted-foreground">{firmUser.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={firmUser.role === "firm_admin" ? "default" : "secondary"}>
                        {firmUser.role === "firm_admin" ? (
                          <><ShieldCheck className="h-3 w-3 mr-1" />Admin</>
                        ) : (
                          <><Shield className="h-3 w-3 mr-1" />User</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {firmUser.usage.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {firmUser.id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              data-testid={`button-user-actions-${firmUser.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {firmUser.role === "user" ? (
                              <DropdownMenuItem
                                onClick={() => updateRoleMutation.mutate({ 
                                  userId: firmUser.id, 
                                  role: "firm_admin" 
                                })}
                                data-testid={`button-promote-${firmUser.id}`}
                              >
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Promote to Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => updateRoleMutation.mutate({ 
                                  userId: firmUser.id, 
                                  role: "user" 
                                })}
                                data-testid={`button-demote-${firmUser.id}`}
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                Demote to User
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setUserToRemove(firmUser)}
                              data-testid={`button-remove-${firmUser.id}`}
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove from Firm
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No users found in your firm.
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User from Firm</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {userToRemove?.email} from your firm? 
              They will lose access to firm resources and their usage will no longer count 
              towards the firm's quota.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToRemove && removeUserMutation.mutate(userToRemove.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              {removeUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
