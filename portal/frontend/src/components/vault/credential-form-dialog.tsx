"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { credentialService } from "@/lib/services/credentials";
import { Credential, CredentialType } from "@/types";
import { PinModal } from "@/components/vault/pin-modal";
import { toast } from "sonner";

interface CredentialFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  siteId: number | string;
  credential?: Credential;
}

interface FieldDef {
  key: string;
  label: string;
  is_sensitive: boolean;
  value: string;
}

const PREDEFINED_FIELDS: Record<string, FieldDef[]> = {
  wordpress: [
    { key: "admin_url", label: "Admin URL", is_sensitive: false, value: "" },
    { key: "username", label: "Username", is_sensitive: false, value: "" },
    { key: "password", label: "Password", is_sensitive: true, value: "" },
    { key: "email", label: "Email", is_sensitive: false, value: "" },
  ],
  hosting: [
    { key: "provider", label: "Provider", is_sensitive: false, value: "" },
    { key: "login_url", label: "Login URL", is_sensitive: false, value: "" },
    { key: "login_email", label: "Login Email", is_sensitive: false, value: "" },
    { key: "password", label: "Password", is_sensitive: true, value: "" },
  ],
  ftp: [
    { key: "host", label: "Host", is_sensitive: false, value: "" },
    { key: "port", label: "Port", is_sensitive: false, value: "" },
    { key: "username", label: "Username", is_sensitive: false, value: "" },
    { key: "password", label: "Password", is_sensitive: true, value: "" },
  ],
  sftp: [
    { key: "host", label: "Host", is_sensitive: false, value: "" },
    { key: "port", label: "Port", is_sensitive: false, value: "" },
    { key: "username", label: "Username", is_sensitive: false, value: "" },
    { key: "password", label: "Password", is_sensitive: true, value: "" },
  ],
  database: [
    { key: "host", label: "Host", is_sensitive: false, value: "" },
    { key: "database_name", label: "Database Name", is_sensitive: false, value: "" },
    { key: "username", label: "Username", is_sensitive: false, value: "" },
    { key: "password", label: "Password", is_sensitive: true, value: "" },
  ],
};

const DEFAULT_LABELS: Record<string, string> = {
  wordpress: "WordPress Admin",
  hosting: "Hosting Panel",
  ftp: "FTP Access",
  sftp: "SFTP Access",
  database: "Database",
  custom: "Custom Credentials",
};

export function CredentialFormDialog({
  isOpen,
  onClose,
  onSuccess,
  siteId,
  credential,
}: CredentialFormDialogProps) {
  const isEditMode = !!credential;

  const [credentialTypes, setCredentialTypes] = useState<CredentialType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());

  // Fetch credential types on mount
  const fetchTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const res = await credentialService.getTypes();
      setCredentialTypes(res.data.data || []);
    } catch {
      toast.error("Failed to load credential types");
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTypes();
    }
  }, [isOpen, fetchTypes]);

  // Initialize form when dialog opens or credential changes
  useEffect(() => {
    if (!isOpen) return;

    if (isEditMode && credential) {
      setSelectedTypeId(credential.credential_type.id);
      setLabel(credential.label || "");
      setFields(
        credential.fields
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((f) => ({
            key: f.field_key,
            label: f.field_label,
            is_sensitive: f.is_sensitive,
            value: f.is_sensitive ? "" : (f.field_value || ""),
          }))
      );
    } else {
      setSelectedTypeId(null);
      setLabel("");
      setFields([]);
    }
    setShowPasswords(new Set());
  }, [isOpen, isEditMode, credential]);

  // When type changes in add mode, populate predefined fields
  const handleTypeChange = (typeId: string | null) => {
    if (!typeId) return;
    const id = Number(typeId);
    setSelectedTypeId(id);
    if (isEditMode) return;

    const selectedType = credentialTypes.find((t) => t.id === id);
    if (!selectedType) return;

    const slug = selectedType.slug;
    const predefined = PREDEFINED_FIELDS[slug];
    if (predefined) {
      setFields(predefined.map((f) => ({ ...f })));
      setLabel(DEFAULT_LABELS[slug] || selectedType.name);
    } else {
      // Custom type — start with one empty field
      setFields([{ key: "", label: "", is_sensitive: false, value: "" }]);
      setLabel(DEFAULT_LABELS.custom);
    }
  };

  const updateField = (index: number, updates: Partial<FieldDef>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const addCustomField = () => {
    setFields((prev) => [
      ...prev,
      { key: "", label: "", is_sensitive: false, value: "" },
    ]);
  };

  const removeCustomField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = () => {
    // Validate
    if (!selectedTypeId) {
      toast.error("Please select a credential type");
      return;
    }
    if (!label.trim()) {
      toast.error("Please enter a label");
      return;
    }

    const selectedType = credentialTypes.find((t) => t.id === selectedTypeId);
    const isCustom = selectedType && !PREDEFINED_FIELDS[selectedType.slug];

    if (isCustom) {
      const invalid = fields.some((f) => !f.key.trim() || !f.label.trim());
      if (invalid) {
        toast.error("All custom fields must have a key and label");
        return;
      }
    }

    // Open PIN modal
    setPinModalOpen(true);
  };

  const handlePinSuccess = async (pin: string) => {
    setSaving(true);
    try {
      const fieldData = fields
        .filter((f) => {
          if (isEditMode && f.is_sensitive && !f.value) return false;
          return true;
        })
        .map((f, i) => ({
          field_key: f.key,
          field_label: f.label,
          field_value: f.value,
          is_sensitive: f.is_sensitive,
          sort_order: i,
        }));

      const payload = {
        credential_type_id: selectedTypeId,
        label: label.trim(),
        fields: fieldData,
        vault_pin: pin,
      };

      if (isEditMode && credential) {
        await credentialService.update(siteId, credential.id, payload);
        toast.success("Credential updated");
      } else {
        await credentialService.create(siteId, payload);
        toast.success("Credential created");
      }
      onSuccess();
    } catch {
      toast.error(isEditMode ? "Failed to update credential" : "Failed to create credential");
    } finally {
      setSaving(false);
    }
  };

  const selectedType = credentialTypes.find((t) => t.id === selectedTypeId);
  const isCustomType = selectedType ? !PREDEFINED_FIELDS[selectedType.slug] : false;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Credential" : "Add Credential"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update the credential fields. Leave sensitive fields empty to keep current values."
                : "Add new credentials for this site."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Credential Type */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              {loadingTypes ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Select
                  value={selectedTypeId ? selectedTypeId.toString() : ""}
                  onValueChange={handleTypeChange}
                  disabled={isEditMode}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select credential type" />
                  </SelectTrigger>
                  <SelectContent>
                    {credentialTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Label */}
            {selectedTypeId && (
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel((e.target as HTMLInputElement).value)}
                  placeholder="e.g. WordPress Admin"
                />
              </div>
            )}

            {/* Fields */}
            {fields.length > 0 && (
              <div className="space-y-3">
                <Label className="text-muted-foreground">Fields</Label>
                {fields.map((field, index) => (
                  <div
                    key={`${field.key || index}`}
                    className="space-y-1.5 rounded-lg border p-3"
                  >
                    {isCustomType && (
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">
                            Key
                          </Label>
                          <Input
                            value={field.key}
                            onChange={(e) =>
                              updateField(index, {
                                key: (e.target as HTMLInputElement).value,
                              })
                            }
                            placeholder="field_key"
                            className="font-mono text-xs"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">
                            Label
                          </Label>
                          <Input
                            value={field.label}
                            onChange={(e) =>
                              updateField(index, {
                                label: (e.target as HTMLInputElement).value,
                              })
                            }
                            placeholder="Field Label"
                          />
                        </div>
                        <div className="flex items-end gap-1">
                          <Button
                            variant={field.is_sensitive ? "default" : "outline"}
                            size="icon-sm"
                            type="button"
                            onClick={() =>
                              updateField(index, {
                                is_sensitive: !field.is_sensitive,
                              })
                            }
                            title={
                              field.is_sensitive ? "Sensitive" : "Not sensitive"
                            }
                          >
                            {field.is_sensitive ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            onClick={() => removeCustomField(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {!isCustomType && (
                      <Label className="text-xs text-muted-foreground">
                        {field.label}
                      </Label>
                    )}

                    <div className="relative">
                      <Input
                        type={
                          field.is_sensitive && !showPasswords.has(field.key)
                            ? "password"
                            : "text"
                        }
                        value={field.value}
                        onChange={(e) =>
                          updateField(index, {
                            value: (e.target as HTMLInputElement).value,
                          })
                        }
                        placeholder={
                          isEditMode && field.is_sensitive
                            ? "Leave empty to keep current"
                            : undefined
                        }
                      />
                      {field.is_sensitive && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          type="button"
                          className="absolute right-1 top-1/2 -translate-y-1/2"
                          onClick={() => togglePasswordVisibility(field.key)}
                        >
                          {showPasswords.has(field.key) ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {isCustomType && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={addCustomField}
                    className="w-full"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Field
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !selectedTypeId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isEditMode ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title={isEditMode ? "Confirm Update" : "Confirm Save"}
        description="Enter your vault PIN to save credentials"
      />
    </>
  );
}

// Inline skeleton to avoid circular dependency issues
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className || ""}`}
    />
  );
}
