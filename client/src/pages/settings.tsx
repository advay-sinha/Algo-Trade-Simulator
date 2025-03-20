import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Sidebar from "@/components/layout/sidebar";
import TopNavbar from "@/components/layout/top-navbar";
import MobileNav from "@/components/layout/mobile-nav";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  UserCircle, 
  Bell, 
  DollarSign, 
  ChartBarSquare, 
  LockClosedIcon, 
  KeyIcon, 
  UserIcon, 
  MailIcon, 
  Save, 
  Moon, 
  Check,
  BadgeCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { UserSettings } from "@/types";

// Profile form schema
const profileFormSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Invalid email address."),
  username: z.string().min(3, "Username must be at least 3 characters."),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Password form schema
const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(6, "New password must be at least 6 characters."),
  confirmPassword: z.string().min(6, "Please confirm your password."),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

// Notification settings schema
const notificationFormSchema = z.object({
  emailAlerts: z.boolean(),
  tradingNotifications: z.boolean(),
  marketUpdates: z.boolean(),
  performanceReports: z.boolean(),
});

type NotificationFormValues = z.infer<typeof notificationFormSchema>;

// Trading preferences schema
const tradingFormSchema = z.object({
  initialBalance: z.string().transform(val => Number(val)),
  defaultTimeframe: z.string(),
  defaultStrategy: z.string(),
  autoRenewSimulations: z.boolean(),
});

type TradingFormValues = z.infer<typeof tradingFormSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";
  
  // Mock saved user settings
  const [userSettings, setUserSettings] = useState<UserSettings>({
    darkMode: isDarkMode,
    notificationsEnabled: true,
    emailAlerts: true,
    initialBalance: 100000,
    marketPreferences: {
      favoriteSymbols: ["NIFTY50.NS", "RELIANCE.NS", "HDFCBANK.NS"],
      defaultTimeFrame: "1D",
      defaultStrategy: "Moving Average Crossover"
    }
  });
  
  // Profile form
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      email: user?.email || "",
      username: user?.username || "",
    },
  });
  
  // Password form
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  
  // Notification settings form
  const notificationForm = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationFormSchema),
    defaultValues: {
      emailAlerts: userSettings.emailAlerts,
      tradingNotifications: true,
      marketUpdates: true,
      performanceReports: true,
    },
  });
  
  // Trading preferences form
  const tradingForm = useForm<TradingFormValues>({
    resolver: zodResolver(tradingFormSchema),
    defaultValues: {
      initialBalance: userSettings.initialBalance.toString(),
      defaultTimeframe: userSettings.marketPreferences.defaultTimeFrame,
      defaultStrategy: userSettings.marketPreferences.defaultStrategy,
      autoRenewSimulations: false,
    },
  });
  
  // Handle profile form submission
  const onProfileSubmit = (data: ProfileFormValues) => {
    toast({
      title: "Profile updated",
      description: "Your profile information has been updated successfully.",
    });
  };
  
  // Handle password form submission
  const onPasswordSubmit = (data: PasswordFormValues) => {
    toast({
      title: "Password changed",
      description: "Your password has been changed successfully.",
    });
    passwordForm.reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };
  
  // Handle notification settings submission
  const onNotificationSubmit = (data: NotificationFormValues) => {
    setUserSettings(prev => ({
      ...prev,
      emailAlerts: data.emailAlerts,
      notificationsEnabled: data.tradingNotifications || data.marketUpdates || data.performanceReports,
    }));
    
    toast({
      title: "Notification settings updated",
      description: "Your notification preferences have been saved.",
    });
  };
  
  // Handle trading preferences submission
  const onTradingSubmit = (data: TradingFormValues) => {
    setUserSettings(prev => ({
      ...prev,
      initialBalance: data.initialBalance,
      marketPreferences: {
        ...prev.marketPreferences,
        defaultTimeFrame: data.defaultTimeframe,
        defaultStrategy: data.defaultStrategy,
      }
    }));
    
    toast({
      title: "Trading preferences updated",
      description: "Your trading preferences have been saved.",
    });
  };
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <TopNavbar />
        
        <div className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your account settings and preferences
              </p>
            </div>
            
            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="grid grid-cols-2 md:grid-cols-5 md:w-fit">
                <TabsTrigger value="profile" className="flex items-center">
                  <UserIcon className="h-4 w-4 mr-2" />
                  <span>Profile</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center">
                  <LockClosedIcon className="h-4 w-4 mr-2" />
                  <span>Security</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="flex items-center">
                  <Bell className="h-4 w-4 mr-2" />
                  <span>Notifications</span>
                </TabsTrigger>
                <TabsTrigger value="trading" className="flex items-center">
                  <ChartBarSquare className="h-4 w-4 mr-2" />
                  <span>Trading</span>
                </TabsTrigger>
                <TabsTrigger value="appearance" className="flex items-center">
                  <Moon className="h-4 w-4 mr-2" />
                  <span>Appearance</span>
                </TabsTrigger>
              </TabsList>
              
              {/* Profile Tab */}
              <TabsContent value="profile">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>
                      Manage your personal information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center md:space-x-6 mb-6">
                          <div className="flex mb-4 md:mb-0">
                            <div className="h-24 w-24 rounded-full flex items-center justify-center bg-primary/10 text-primary">
                              <UserCircle className="h-16 w-16" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-medium">Profile Picture</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              Upload a profile picture or avatar.
                            </p>
                            <div className="flex space-x-2">
                              <Button type="button" variant="outline" size="sm">
                                Upload Image
                              </Button>
                              <Button type="button" variant="ghost" size="sm">
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            control={profileForm.control}
                            name="fullName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Your full name" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={profileForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                  <Input placeholder="username" {...field} />
                                </FormControl>
                                <FormDescription>
                                  This is your public display name.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={profileForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="your@email.com" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <Button type="submit" className="w-full md:w-auto">
                          <Save className="h-4 w-4 mr-2" />
                          Save Profile
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Security Tab */}
              <TabsContent value="security">
                <Card>
                  <CardHeader>
                    <CardTitle>Security</CardTitle>
                    <CardDescription>
                      Manage your password and account security
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Form {...passwordForm}>
                      <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                        <div className="space-y-4">
                          <FormField
                            control={passwordForm.control}
                            name="currentPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Current Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={passwordForm.control}
                            name="newPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>New Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormDescription>
                                  Password must be at least 6 characters long.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={passwordForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirm New Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <Button type="submit" className="w-full md:w-auto">
                          <KeyIcon className="h-4 w-4 mr-2" />
                          Change Password
                        </Button>
                      </form>
                    </Form>
                    
                    <div className="pt-6 border-t">
                      <h3 className="text-lg font-medium mb-4">Two-Factor Authentication</h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Two-factor authentication is not enabled yet.</p>
                          <p className="text-sm text-muted-foreground">
                            Add an extra layer of security to your account by enabling 2FA.
                          </p>
                        </div>
                        <Button variant="outline">Enable</Button>
                      </div>
                    </div>
                    
                    <div className="pt-6 border-t">
                      <h3 className="text-lg font-medium mb-4">Account</h3>
                      <div>
                        <Button variant="destructive" onClick={() => logoutMutation.mutate()}>
                          Sign Out of All Devices
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Notifications Tab */}
              <TabsContent value="notifications">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Settings</CardTitle>
                    <CardDescription>
                      Choose how you want to be notified about trading activities
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...notificationForm}>
                      <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6">
                        <div className="space-y-4">
                          <FormField
                            control={notificationForm.control}
                            name="emailAlerts"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Email Alerts
                                  </FormLabel>
                                  <FormDescription>
                                    Receive important alerts via email
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={notificationForm.control}
                            name="tradingNotifications"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Trading Notifications
                                  </FormLabel>
                                  <FormDescription>
                                    Get notified when trades are executed
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={notificationForm.control}
                            name="marketUpdates"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Market Updates
                                  </FormLabel>
                                  <FormDescription>
                                    Receive updates about significant market movements
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={notificationForm.control}
                            name="performanceReports"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Performance Reports
                                  </FormLabel>
                                  <FormDescription>
                                    Get weekly summaries of your trading performance
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <Button type="submit" className="w-full md:w-auto">
                          <Save className="h-4 w-4 mr-2" />
                          Save Notification Settings
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Trading Tab */}
              <TabsContent value="trading">
                <Card>
                  <CardHeader>
                    <CardTitle>Trading Preferences</CardTitle>
                    <CardDescription>
                      Customize your trading simulation settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...tradingForm}>
                      <form onSubmit={tradingForm.handleSubmit(onTradingSubmit)} className="space-y-6">
                        <div className="space-y-4">
                          <FormField
                            control={tradingForm.control}
                            name="initialBalance"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Default Initial Balance (₹)</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                      type="number" 
                                      placeholder="100000" 
                                      className="pl-9"
                                      {...field} 
                                    />
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  The starting balance for new simulations
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={tradingForm.control}
                            name="defaultTimeframe"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Default Time Frame</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a time frame" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="1D">1 Day</SelectItem>
                                    <SelectItem value="1W">1 Week</SelectItem>
                                    <SelectItem value="1M">1 Month</SelectItem>
                                    <SelectItem value="3M">3 Months</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Default chart time frame
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={tradingForm.control}
                            name="defaultStrategy"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Default Trading Strategy</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a strategy" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Moving Average Crossover">Moving Average Crossover</SelectItem>
                                    <SelectItem value="RSI Oscillator">RSI Oscillator</SelectItem>
                                    <SelectItem value="MACD Divergence">MACD Divergence</SelectItem>
                                    <SelectItem value="Bollinger Bands">Bollinger Bands</SelectItem>
                                    <SelectItem value="Custom Strategy">Custom Strategy</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Strategy to use for new simulations
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={tradingForm.control}
                            name="autoRenewSimulations"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Auto-renew Simulations
                                  </FormLabel>
                                  <FormDescription>
                                    Automatically start a new simulation when the current one completes
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <Button type="submit" className="w-full md:w-auto">
                          <Save className="h-4 w-4 mr-2" />
                          Save Trading Preferences
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Appearance Tab */}
              <TabsContent value="appearance">
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                      Customize how AlgoTrade looks and feels
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <div className="text-base font-medium">
                            Dark Mode
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Switch between light and dark themes
                          </div>
                        </div>
                        <Switch
                          checked={isDarkMode}
                          onCheckedChange={toggleTheme}
                        />
                      </div>
                      
                      <div className="rounded-lg border">
                        <div className="p-4 border-b">
                          <h3 className="text-base font-medium">Theme Preview</h3>
                        </div>
                        <div className="p-4">
                          <div className="flex space-x-4">
                            <div className="flex-1 rounded-md bg-primary p-4 text-primary-foreground">
                              Primary
                            </div>
                            <div className="flex-1 rounded-md bg-secondary p-4 text-secondary-foreground">
                              Secondary
                            </div>
                            <div className="flex-1 rounded-md bg-muted p-4 text-muted-foreground">
                              Muted
                            </div>
                          </div>
                          <div className="flex items-center space-x-4 mt-4">
                            <Button>Primary Button</Button>
                            <Button variant="outline">Outline Button</Button>
                            <Button variant="ghost">Ghost Button</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-6 border-t">
                      <h3 className="text-lg font-medium mb-4">Display Customization</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <div className="text-base font-medium">
                              Compact Mode
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Display more information with less spacing
                            </div>
                          </div>
                          <Switch defaultChecked={false} />
                        </div>
                        
                        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <div className="text-base font-medium">
                              Animation Effects
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Enable or disable UI animations
                            </div>
                          </div>
                          <Switch defaultChecked={true} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full md:w-auto">
                      <Check className="h-4 w-4 mr-2" />
                      Save Appearance Settings
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        
        <MobileNav />
      </main>
    </div>
  );
}
