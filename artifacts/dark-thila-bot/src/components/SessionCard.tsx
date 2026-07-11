import { SessionStatus, useDisconnectSession, getListSessionsQueryKey, SessionStatusStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { useToast } from "@/hooks/use-toast";
import { Power, Loader2, AlertCircle, UserCog, Save, RefreshCw, Upload } from "lucide-react";
import { StatusSettingsPanel } from "./StatusSettingsPanel";
import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/use-socket";
import { useAuth } from "@/context/AuthContext";

interface SessionCardProps {
  session: SessionStatus;
}

export function SessionCard({ session }: SessionCardProps) {
  const { toast } = useToast();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const disconnectSession = useDisconnectSession();
  const { joinSession } = useSocket();
  const [ownerInput, setOwnerInput] = useState(session.owner || "");
  const [savingOwner, setSavingOwner] = useState(false);
  const [showOwnerEdit, setShowOwnerEdit] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showLogoUrl, setShowLogoUrl] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState("");
  const [savingLogoUrl, setSavingLogoUrl] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  useEffect(() => {
    joinSession(session.sessionId);
  }, [session.sessionId, joinSession]);

  useEffect(() => {
    setOwnerInput(session.owner || "");
  }, [session.owner]);

  const onDisconnect = () => {
    disconnectSession.mutate(
      { data: { sessionId: session.sessionId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({
            title: "Session Terminated",
            description: `Session ${session.sessionId} has been disconnected.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Termination Failed",
            description: error.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  };

  const onForceReconnect = async () => {
    setReconnecting(true);
    try {
      const res = await fetch(`/api/sessions/${session.sessionId}/reconnect`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reconnect");
      }
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      toast({ title: "Reconnecting", description: "Session credentials cleared. Scan the new QR or pairing code." });
    } catch (err: any) {
      toast({ title: "Reconnect Failed", description: err.message, variant: "destructive" });
    } finally {
      setReconnecting(false);
    }
  };

  const onSaveOwner = async () => {
    const digits = ownerInput.replace(/\D/g, "");
    if (!digits) {
      toast({ title: "Invalid Number", description: "Please enter a valid phone number.", variant: "destructive" });
      return;
    }
    setSavingOwner(true);
    try {
      const res = await fetch(`/api/sessions/${session.sessionId}/owner`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ ownerNumber: digits }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update owner");
      }
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      toast({ title: "Owner Updated", description: `Owner set to: ${digits}` });
      setShowOwnerEdit(false);
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingOwner(false);
    }
  };

  const transformLogoUrl = (url: string): string => {
    const trimmed = url.trim();
    // Google Drive: /file/d/ID/view → direct download
    const gdMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (gdMatch) return `https://drive.google.com/uc?export=download&id=${gdMatch[1]}`;
    // Google Drive open link
    const gdOpen = trimmed.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (gdOpen) return `https://drive.google.com/uc?export=download&id=${gdOpen[1]}`;
    return trimmed;
  };

  const onSaveLogoUrl = async () => {
    const url = transformLogoUrl(logoUrlInput);
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      toast({ title: "Invalid URL", description: "Please paste a valid image URL.", variant: "destructive" });
      return;
    }
    setSavingLogoUrl(true);
    try {
      const res = await fetch(`/api/sessions/${session.sessionId}/logo-url`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save logo");
      }
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      toast({ title: "Logo Updated", description: "Bot logo URL saved!" });
      setShowLogoUrl(false);
      setLogoUrlInput("");
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingLogoUrl(false);
    }
  };

  const onLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Please select an image under 2MB.", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/sessions/${session.sessionId}/logo`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ imageData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      toast({ title: "Logo Updated", description: "Bot logo uploaded successfully!" });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const getStatusColor = (status: SessionStatusStatus) => {
    switch (status) {
      case "connected":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "qr":
      case "pairing":
      case "reconnecting":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-red-500/10 text-red-500 border-red-500/20";
    }
  };

  return (
    <div className="rounded-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]">
    <Card className="border-primary/10 bg-card/30 hover:border-primary/30 transition-colors duration-300 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <div className="font-mono text-lg font-bold tracking-tight text-primary">
            {session.sessionId}
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            {session.phoneNumber}
          </div>
        </div>
        <Badge variant="outline" className={`uppercase font-mono tracking-widest ${getStatusColor(session.status)}`}>
          {session.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="min-h-[200px] flex flex-col items-center justify-center border border-dashed border-border/50 rounded-md p-4 bg-background/50">
          {session.status === "qr" && session.qrCode && (
            <div className="space-y-2 text-center">
              <img src={session.qrCode} alt="QR Code" className="w-48 h-48 bg-white p-2 rounded-md mx-auto" />
              <p className="text-xs font-mono text-yellow-500">AWAITING_SCAN</p>
            </div>
          )}

          {session.status === "pairing" && session.pairingCode && (
            <div className="space-y-4 text-center">
              <div className="font-mono text-4xl tracking-[0.5em] font-bold text-primary bg-primary/10 py-4 px-6 rounded-md border border-primary/20 inline-block">
                {session.pairingCode}
              </div>
              <p className="text-xs font-mono text-yellow-500">AWAITING_PAIRING</p>
            </div>
          )}

          {(session.status === "connected" || session.status === "reconnecting") && (
            <div className="space-y-4 text-center w-full">
              <div className="relative w-20 h-20 mx-auto group">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center border overflow-hidden ${session.status === "reconnecting" ? "bg-yellow-500/10 border-yellow-500/20" : "bg-green-500/10 border-green-500/20"}`}>
                  <img
                    src={session.logo || `${import.meta.env.BASE_URL}bot-logo.png`}
                    alt="Logo"
                    className={`w-full h-full rounded-full object-cover ${session.status === "reconnecting" ? "opacity-60" : ""}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}bot-logo.png`;
                    }}
                  />
                </div>
                {session.status === "connected" && (
                  <label
                    className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Upload logo"
                  >
                    {uploadingLogo
                      ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                      : <Upload className="w-5 h-5 text-white" />
                    }
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onLogoUpload}
                      disabled={uploadingLogo}
                    />
                  </label>
                )}
              </div>
              <div className="space-y-1">
                {session.status === "reconnecting" ? (
                  <p className="text-xs font-mono text-yellow-500 flex items-center justify-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {(session.retryCount ?? 0) >= 5
                      ? `RECONNECTING... (attempt ${session.retryCount})`
                      : "RECONNECTING..."}
                  </p>
                ) : (
                  <p className="text-xs font-mono text-green-500">UPLINK_ESTABLISHED</p>
                )}
                {session.owner ? (
                  <p className="text-xs font-mono text-muted-foreground">OWNER: {session.owner}</p>
                ) : (
                  <p className="text-xs font-mono text-yellow-500">OWNER: NOT SET</p>
                )}
              </div>

              {session.status === "reconnecting" && (session.retryCount ?? 0) >= 5 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono text-xs h-8 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500/60"
                  onClick={onForceReconnect}
                  disabled={reconnecting}
                >
                  {reconnecting ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  {reconnecting ? "RESETTING..." : "FORCE_RECONNECT"}
                </Button>
              )}

              {session.status === "connected" && (
                <>
                  {/* Logo URL input */}
                  {showLogoUrl ? (
                    <div className="flex gap-2 w-full px-2">
                      <Input
                        className="font-mono text-xs h-8 bg-background/80 border-primary/20 focus:border-primary/60"
                        placeholder="https://catbox.moe/... or Google Drive link"
                        value={logoUrlInput}
                        onChange={(e) => setLogoUrlInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSaveLogoUrl()}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 font-mono text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                        onClick={onSaveLogoUrl}
                        disabled={savingLogoUrl}
                      >
                        {savingLogoUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 font-mono text-xs text-muted-foreground"
                        onClick={() => { setShowLogoUrl(false); setLogoUrlInput(""); }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-mono text-xs h-8 border-primary/20 text-primary/70 hover:text-primary hover:border-primary/50"
                      onClick={() => setShowLogoUrl(true)}
                    >
                      <Upload className="w-3 h-3 mr-1" />
                      SET_LOGO_URL
                    </Button>
                  )}

                  {showOwnerEdit ? (
                    <div className="flex gap-2 w-full px-2">
                      <Input
                        className="font-mono text-xs h-8 bg-background/80 border-primary/20 focus:border-primary/60"
                        placeholder="94771234567"
                        value={ownerInput}
                        onChange={(e) => setOwnerInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSaveOwner()}
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 font-mono text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                        onClick={onSaveOwner}
                        disabled={savingOwner}
                      >
                        {savingOwner ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 font-mono text-xs text-muted-foreground"
                        onClick={() => { setShowOwnerEdit(false); setOwnerInput(session.owner || ""); }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-mono text-xs h-8 border-primary/20 text-primary/70 hover:text-primary hover:border-primary/50"
                      onClick={() => setShowOwnerEdit(true)}
                    >
                      <UserCog className="w-3 h-3 mr-1" />
                      {session.owner ? "CHANGE_OWNER" : "SET_OWNER"}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {(session.status === "disconnected" || session.status === "idle") && (
            <div className="space-y-4 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="text-xs font-mono text-red-500">LINK_SEVERED</p>
            </div>
          )}
        </div>

        <StatusSettingsPanel
          sessionId={session.sessionId}
          isConnected={session.status === "connected" || session.status === "reconnecting"}
        />

        <Button
          variant="destructive"
          className="w-full font-mono uppercase tracking-widest bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 mt-3"
          onClick={onDisconnect}
          disabled={disconnectSession.isPending}
        >
          <Power className="w-4 h-4 mr-2" />
          {disconnectSession.isPending ? "TERMINATING..." : "TERMINATE_LINK"}
        </Button>
      </CardContent>
    </Card>
    </div>
  );
}
