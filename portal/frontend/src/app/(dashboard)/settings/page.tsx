"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, EyeOff, Send, Save, Loader2 } from "lucide-react";
import { settingsService } from "@/lib/services/settings";
import { toast } from "sonner";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramTopicId, setTelegramTopicId] = useState("");
  const [portalBaseUrl, setPortalBaseUrl] = useState("");
  const [agentPingInterval, setAgentPingInterval] = useState("");
  const [maxDeploymentRetries, setMaxDeploymentRetries] = useState("");

  // Track the original masked token to detect user changes
  const [originalMaskedToken, setOriginalMaskedToken] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await settingsService.get();
      const data = res.data.data;
      setTelegramBotToken(data.telegram_bot_token || "");
      setOriginalMaskedToken(data.telegram_bot_token || "");
      setTelegramChatId(data.telegram_default_chat_id || "");
      setTelegramTopicId(data.telegram_topic_id || "");
      setPortalBaseUrl(data.portal_base_url || "");
      setAgentPingInterval(data.agent_ping_interval_minutes || "");
      setMaxDeploymentRetries(data.max_deployment_retries || "");
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string | number | null> = {
        telegram_default_chat_id: telegramChatId,
        telegram_topic_id: telegramTopicId || null,
        portal_base_url: portalBaseUrl,
        agent_ping_interval_minutes: agentPingInterval,
        max_deployment_retries: maxDeploymentRetries,
      };

      // Only include bot token if user changed it from the masked value
      if (telegramBotToken !== originalMaskedToken) {
        payload.telegram_bot_token = telegramBotToken;
      }

      await settingsService.update(payload);
      toast.success("Settings saved successfully");
      // Refresh to get updated masked values
      fetchSettings();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTesting(true);
    try {
      await settingsService.testTelegram(telegramChatId || undefined);
      toast.success("Test message sent successfully! Check your Telegram.");
    } catch {
      toast.error("Failed to send test message. Check your bot token and chat ID.");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage portal configuration and integrations
        </p>
      </div>

      {/* Telegram Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Telegram Notifications</CardTitle>
          <CardDescription>
            Configure Telegram bot for sending notifications and alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="telegram-token">Bot Token</Label>
            <div className="relative">
              <Input
                id="telegram-token"
                type={showToken ? "text" : "password"}
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="123456789:ABCDefGHIjklMNOpqrsTUVwxyz"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your bot token from{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                @BotFather
              </a>{" "}
              on Telegram
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="telegram-chat-id">Default Chat ID</Label>
            <Input
              id="telegram-chat-id"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">
              Use{" "}
              <a
                href="https://t.me/userinfobot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                @userinfobot
              </a>{" "}
              or check the Telegram API to find your chat ID
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="telegram-topic-id">Topic ID (Optional)</Label>
            <Input
              id="telegram-topic-id"
              value={telegramTopicId}
              onChange={(e) => setTelegramTopicId(e.target.value)}
              placeholder="123"
            />
            <p className="text-xs text-muted-foreground">
              For forum/topic-enabled groups, specify the message_thread_id to send
              notifications to a specific topic. Leave empty to send to the general chat.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleTestTelegram}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>
        </CardContent>
      </Card>

      {/* Portal Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Portal Configuration</CardTitle>
          <CardDescription>
            General portal settings and agent communication parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="portal-url">Portal Base URL</Label>
            <Input
              id="portal-url"
              value={portalBaseUrl}
              onChange={(e) => setPortalBaseUrl(e.target.value)}
              placeholder="http://localhost:8081"
            />
            <p className="text-xs text-muted-foreground">
              The public URL used by agents to communicate with this portal
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ping-interval">Agent Ping Interval</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ping-interval"
                  type="number"
                  min={1}
                  max={60}
                  value={agentPingInterval}
                  onChange={(e) => setAgentPingInterval(e.target.value)}
                  placeholder="5"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  minutes
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-retries">Max Deployment Retries</Label>
              <Input
                id="max-retries"
                type="number"
                min={0}
                max={10}
                value={maxDeploymentRetries}
                onChange={(e) => setMaxDeploymentRetries(e.target.value)}
                placeholder="3"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
