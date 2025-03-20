import { useState } from "react";
import DashboardLayout from "@/components/layouts/dashboard-layout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Check, Key, RefreshCw, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ApiKey = {
  id: string;
  name: string;
  service: string;
  createdAt: string;
  lastUsed: string | null;
  status: "active" | "expired" | "inactive";
};

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("api-keys");
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState(false);
  const [newKeyDetails, setNewKeyDetails] = useState({
    name: "",
    service: "yahoo-finance",
    apiKey: "",
  });

  // Fetch user's API keys
  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/user/api-keys"],
  });

  // Fetch API connection status
  const { data: apiStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/api-status"],
  });

  // Add new API key mutation
  const addKeyMutation = useMutation({
    mutationFn: async (data: typeof newKeyDetails) => {
      const res = await apiRequest("POST", "/api/user/api-keys", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/api-status"] });
      toast({
        title: "API key added",
        description: "Your new API key has been added successfully.",
      });
      setIsAddKeyDialogOpen(false);
      setNewKeyDetails({
        name: "",
        service: "yahoo-finance",
        apiKey: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete API key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await apiRequest("DELETE", `/api/user/api-keys/${keyId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/api-status"] });
      toast({
        title: "API key deleted",
        description: "The API key has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle API key status mutation
  const toggleKeyMutation = useMutation({
    mutationFn: async ({ keyId, active }: { keyId: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/user/api-keys/${keyId}`, { active });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/api-status"] });
      toast({
        title: "API key updated",
        description: "The API key status has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test API connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (service: string) => {
      const res = await apiRequest("POST", "/api/test-api-connection", { service });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-status"] });
      toast({
        title: data.success ? "Connection successful" : "Connection failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection test failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle add new key form submit
  const handleAddKey = () => {
    if (!newKeyDetails.name || !newKeyDetails.apiKey) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    addKeyMutation.mutate(newKeyDetails);
  };

  // Handle delete key
  const handleDeleteKey = (keyId: string) => {
    if (confirm("Are you sure you want to delete this API key?")) {
      deleteKeyMutation.mutate(keyId);
    }
  };

  // Handle toggle key status
  const handleToggleKey = (keyId: string, currentStatus: string) => {
    const active = currentStatus !== "active";
    toggleKeyMutation.mutate({ keyId, active });
  };

  // Handle test connection
  const handleTestConnection = (service: string) => {
    testConnectionMutation.mutate(service);
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="api-status">API Status</TabsTrigger>
          </TabsList>
          
          <TabsContent value="api-keys">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Your API Keys</CardTitle>
                    <CardDescription>
                      Manage your external API connections
                    </CardDescription>
                  </div>
                  <Dialog open={isAddKeyDialogOpen} onOpenChange={setIsAddKeyDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add New API Key
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New API Key</DialogTitle>
                        <DialogDescription>
                          Add a new API key for external market data services
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="key-name">Key Name</Label>
                          <Input
                            id="key-name"
                            placeholder="My Yahoo Finance API Key"
                            value={newKeyDetails.name}
                            onChange={(e) => setNewKeyDetails({ ...newKeyDetails, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="service">Service</Label>
                          <Select
                            value={newKeyDetails.service}
                            onValueChange={(value) => setNewKeyDetails({ ...newKeyDetails, service: value })}
                          >
                            <SelectTrigger id="service">
                              <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yahoo-finance">Yahoo Finance</SelectItem>
                              <SelectItem value="alpha-vantage">Alpha Vantage</SelectItem>
                              <SelectItem value="binance">Binance</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="api-key">API Key</Label>
                          <Input
                            id="api-key"
                            placeholder="Enter your API key"
                            value={newKeyDetails.apiKey}
                            onChange={(e) => setNewKeyDetails({ ...newKeyDetails, apiKey: e.target.value })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddKeyDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddKey}
                          disabled={addKeyMutation.isPending}
                        >
                          {addKeyMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Add Key
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !apiKeys || apiKeys.length === 0 ? (
                  <div className="text-center py-8">
                    <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No API Keys Found</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add your first API key to connect to external market data services
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{key.name}</h3>
                            <Badge variant={key.status === "active" ? "outline" : "secondary"}>
                              {key.status === "active" ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {key.service} · Added on {new Date(key.createdAt).toLocaleDateString()}
                            {key.lastUsed && ` · Last used ${new Date(key.lastUsed).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleToggleKey(key.id, key.status)}
                            disabled={toggleKeyMutation.isPending}
                          >
                            {key.status === "active" ? "Disable" : "Enable"}
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDeleteKey(key.id)}
                            disabled={deleteKeyMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col items-start">
                <Alert className="mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important</AlertTitle>
                  <AlertDescription>
                    Your API keys are stored securely and used only for fetching market data. 
                    We never share your keys with third parties.
                  </AlertDescription>
                </Alert>
                <div className="text-sm text-muted-foreground">
                  Need help getting API keys? Check out our{" "}
                  <a href="#" className="text-primary hover:underline">
                    documentation
                  </a>
                  .
                </div>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="api-status">
            <Card>
              <CardHeader>
                <CardTitle>API Connection Status</CardTitle>
                <CardDescription>
                  Check the status of your API connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statusLoading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !apiStatus || Object.keys(apiStatus).length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No API Connections</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add API keys to see connection status
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(apiStatus).map(([service, status]: [string, any]) => (
                      <div key={service} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium capitalize">{service.replace('-', ' ')}</h3>
                            <Badge variant={status.connected ? "success" : "destructive"}>
                              {status.connected ? "Connected" : "Disconnected"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {status.message}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleTestConnection(service)}
                            disabled={testConnectionMutation.isPending}
                          >
                            {testConnectionMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Test Connection
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <div className="text-sm text-muted-foreground">
                  Having connection issues?{" "}
                  <a href="#" className="text-primary hover:underline">
                    Check our troubleshooting guide
                  </a>
                  .
                </div>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
