import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { checkAdminExists, createCustomAdmin } from "@/lib/erp.functions";
import { Building2, UserPlus, Eye, EyeOff } from "lucide-react";
import { ColorfulSpinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — One Associate" },
      { name: "description", content: "Sign in to One Associate to manage billing, customers, collections, and invoices." },
      { property: "og:title", content: "Sign In — One Associate" },
      { property: "og:description", content: "Sign in to your One Associate billing workspace." },
      { property: "og:url", content: "https://oneassociatebd.lovable.app/login" },
    ],
    links: [
      { rel: "canonical", href: "https://oneassociatebd.lovable.app/login" },
    ],
  }),
  component: LoginPage,
});


function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const checkAdmin = useServerFn(checkAdminExists);
  const createCustom = useServerFn(createCustomAdmin);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  // Check if admin exists on mount
  useEffect(() => {
    const run = async () => {
      try {
        const res = await checkAdmin();
        setAdminExists(res.exists);
      } catch {
        setAdminExists(false);
      }
    };
    run();
  }, [checkAdmin]);


  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        toast.error("This account has been disabled. Please contact administrator.");
        setSubmitting(false);
        return;
      }
    }
    const days = remember ? 30 : 1;
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem("erp-session-expiry", String(expiresAt));
    localStorage.setItem("erp-remember", remember ? "1" : "0");
    toast.success("Signed in");
    navigate({ to: "/dashboard" });
  };



  const handleCreateCustomAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminPassword || !newAdminName) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (!validateEmail(newAdminEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createCustom({
        data: { name: newAdminName, email: newAdminEmail, password: newAdminPassword },
      });
      if (res.created) {
        toast.success(`Admin created: ${res.email}`);
        setEmail(res.email);
        setPassword(newAdminPassword);
        setAdminExists(true);
        setShowCreateForm(false);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create admin");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/40 to-background p-4">
      <h1 className="sr-only">Sign in to One Associate</h1>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">One Associate</CardTitle>
          <CardDescription>Billing & Client Management System</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <ColorfulSpinner size="sm" /> Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
              >
                Forgot Password?
              </Button>
            </div>
          </form>


          <div className="mt-6 pt-4 border-t">
            {adminExists === null && (
              <div className="flex items-center justify-center gap-2 py-2">
                <ColorfulSpinner size="sm" />
                <p className="text-xs text-muted-foreground">Checking setup...</p>
              </div>
            )}

            {adminExists === true && (
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">An admin already exists. Please sign in.</p>
              </div>
            )}

            {adminExists === false && !showCreateForm && (
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">No admin found. Create the first admin.</p>
                <div className="flex justify-center">
                  <Button variant="default" size="sm" onClick={() => setShowCreateForm(true)} className="gap-1">
                    <UserPlus className="h-3.5 w-3.5" />
                    Create admin
                  </Button>
                </div>

              </div>
            )}

            {adminExists === false && showCreateForm && (
              <form onSubmit={handleCreateCustomAdmin} className="space-y-3">
                <p className="text-xs font-medium text-center">Create Admin with Your Email</p>
                <div className="space-y-2">
                  <Label htmlFor="new-name" className="text-xs">Full Name</Label>
                  <Input id="new-name" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="Your Name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-email" className="text-xs">Email</Label>
                  <Input id="new-email" type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="you@company.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input id="new-password" type={showNewPassword ? "text" : "password"} value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} className="pr-10" />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <ColorfulSpinner size="sm" /> Creating...
                      </span>
                    ) : (
                      "Create Admin"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your account email. We'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!validateEmail(forgotEmail)) {
                toast.error("Please enter a valid email address.");
                return;
              }
              setForgotSubmitting(true);
              const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setForgotSubmitting(false);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Password reset link sent. Check your email.");
              setForgotOpen(false);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={forgotSubmitting}>
                {forgotSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <ColorfulSpinner size="sm" /> Sending...
                  </span>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
