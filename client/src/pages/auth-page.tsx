import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, ChartLine, Moon, Sun } from "lucide-react";
import { FaGoogle, FaGithub } from "react-icons/fa";
import { useTheme } from "@/hooks/use-theme";

// Login schema
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Register schema extends the insertUserSchema
const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [showSignUp, setShowSignUp] = useState(false);
  const { user, isLoading, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Register form
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
    },
  });

  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterFormValues) => {
    const { confirmPassword, ...registerData } = data;
    registerMutation.mutate(registerData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center">
              <ChartLine className="h-8 w-8 text-primary mr-2" />
              <h1 className="text-2xl font-bold">AlgoTrade</h1>
            </div>
          </div>
          
          {/* Form Toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <Button
                variant={!showSignUp ? "default" : "outline"}
                onClick={() => setShowSignUp(false)}
                className={!showSignUp ? "" : "text-muted-foreground"}
              >
                Sign In
              </Button>
              <Button
                variant={showSignUp ? "default" : "outline"}
                onClick={() => setShowSignUp(true)}
                className={showSignUp ? "" : "text-muted-foreground"}
              >
                Sign Up
              </Button>
            </div>
          </div>
          
          {/* Sign In Form */}
          {!showSignUp && (
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
              <div className="mb-4">
                <Label htmlFor="login-username">Username</Label>
                <Input
                  id="login-username"
                  type="text"
                  placeholder="username"
                  {...loginForm.register("username")}
                  className="mt-1"
                />
                {loginForm.formState.errors.username && (
                  <p className="text-sm text-destructive mt-1">
                    {loginForm.formState.errors.username.message}
                  </p>
                )}
              </div>
              
              <div className="mb-6">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  {...loginForm.register("password")}
                  className="mt-1"
                />
                {loginForm.formState.errors.password && (
                  <p className="text-sm text-destructive mt-1">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sign In
              </Button>
              
              <div className="mt-4 text-center text-sm text-muted-foreground">
                <a href="#" className="text-primary hover:underline">
                  Forgot password?
                </a>
              </div>
            </form>
          )}
          
          {/* Sign Up Form */}
          {showSignUp && (
            <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
              <div className="mb-4">
                <Label htmlFor="register-fullname">Full Name</Label>
                <Input
                  id="register-fullname"
                  type="text"
                  placeholder="John Doe"
                  {...registerForm.register("fullName")}
                  className="mt-1"
                />
                {registerForm.formState.errors.fullName && (
                  <p className="text-sm text-destructive mt-1">
                    {registerForm.formState.errors.fullName.message}
                  </p>
                )}
              </div>
              
              <div className="mb-4">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder="your@email.com"
                  {...registerForm.register("email")}
                  className="mt-1"
                />
                {registerForm.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1">
                    {registerForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <div className="mb-4">
                <Label htmlFor="register-username">Username</Label>
                <Input
                  id="register-username"
                  type="text"
                  placeholder="username"
                  {...registerForm.register("username")}
                  className="mt-1"
                />
                {registerForm.formState.errors.username && (
                  <p className="text-sm text-destructive mt-1">
                    {registerForm.formState.errors.username.message}
                  </p>
                )}
              </div>
              
              <div className="mb-4">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder="••••••••"
                  {...registerForm.register("password")}
                  className="mt-1"
                />
                {registerForm.formState.errors.password && (
                  <p className="text-sm text-destructive mt-1">
                    {registerForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              
              <div className="mb-6">
                <Label htmlFor="register-confirm-password">Confirm Password</Label>
                <Input
                  id="register-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  {...registerForm.register("confirmPassword")}
                  className="mt-1"
                />
                {registerForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive mt-1">
                    {registerForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Create Account
              </Button>
            </form>
          )}
          
          {/* Social Login */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-background text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" className="w-full">
                <FaGoogle className="mr-2 h-4 w-4 text-red-500" />
                Google
              </Button>
              <Button variant="outline" className="w-full">
                <FaGithub className="mr-2 h-4 w-4" />
                GitHub
              </Button>
            </div>
          </div>
          
          {/* Dark mode toggle */}
          <div className="mt-8 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={toggleTheme}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4 mr-2" />
              ) : (
                <Moon className="h-4 w-4 mr-2" />
              )}
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
