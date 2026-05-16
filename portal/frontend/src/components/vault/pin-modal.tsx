"use client";

import { useState, useCallback, useEffect } from "react";
import { Lock, Delete, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { vaultPinService } from "@/lib/services/vault-pin";
import axios from "axios";

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  description?: string;
}

const PIN_LENGTH = 6;

type ModalState = "default" | "error" | "locked" | "loading";

export function PinModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Enter Vault PIN",
  description = "Required to reveal sensitive credentials",
}: PinModalProps) {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<ModalState>("default");
  const [errorMessage, setErrorMessage] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPin("");
      setState("default");
      setErrorMessage("");
      setAttemptsRemaining(null);
    }
  }, [isOpen]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (state === "locked" || state === "loading") return;
      if (pin.length >= PIN_LENGTH) return;

      const newPin = pin + digit;
      setPin(newPin);

      // Clear error state on new input
      if (state === "error") {
        setState("default");
        setErrorMessage("");
      }

      // Auto-submit when 6 digits entered
      if (newPin.length === PIN_LENGTH) {
        verifyPin(newPin);
      }
    },
    [pin, state]
  );

  const handleBackspace = useCallback(() => {
    if (state === "locked" || state === "loading") return;
    setPin((prev) => prev.slice(0, -1));
    if (state === "error") {
      setState("default");
      setErrorMessage("");
    }
  }, [state]);

  const verifyPin = async (pinToVerify: string) => {
    setState("loading");
    try {
      const response = await vaultPinService.verify(pinToVerify);
      if (response.data.data.verified) {
        onSuccess(pinToVerify);
        onClose();
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 423) {
          setState("locked");
          setErrorMessage(
            "Vault locked for 15 minutes. Admin has been notified."
          );
        } else {
          // 401, 422, or other validation errors = wrong PIN
          setState("error");
          const remaining = error.response?.data?.attempts_remaining;
          if (remaining !== undefined) {
            setAttemptsRemaining(remaining);
            setErrorMessage(`${remaining} attempts remaining`);
          } else {
            setErrorMessage("Incorrect PIN. Please try again.");
          }
          setPin("");
        }
      } else {
        setState("error");
        setErrorMessage("An error occurred. Please try again.");
        setPin("");
      }
    }
  };

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleDigit, handleBackspace]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[320px] p-6">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* PIN Dots */}
        <div className="flex items-center justify-center gap-3 py-4">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-3 w-3 rounded-full transition-all duration-150",
                i < pin.length
                  ? state === "error"
                    ? "bg-red-500 animate-shake"
                    : "bg-primary scale-110"
                  : "bg-muted-foreground/20"
              )}
            />
          ))}
          {state === "loading" && (
            <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Error / Locked message */}
        {errorMessage && (
          <p
            className={cn(
              "text-center text-xs font-medium",
              state === "locked" ? "text-orange-500" : "text-red-500"
            )}
          >
            {errorMessage}
          </p>
        )}

        {/* Numpad */}
        {state !== "locked" ? (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map(
              (key) => {
                if (key === "") {
                  return <div key="empty" />;
                }
                if (key === "back") {
                  return (
                    <button
                      key="back"
                      type="button"
                      onClick={handleBackspace}
                      disabled={state === "loading"}
                      className="flex h-14 w-full items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:bg-muted/80 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Delete className="h-5 w-5" />
                    </button>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleDigit(key)}
                    disabled={state === "loading"}
                    className="flex h-14 w-full items-center justify-center rounded-lg text-lg font-medium transition-colors hover:bg-muted active:bg-muted/80 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {key}
                  </button>
                );
              }
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-6">
            <Lock className="h-8 w-8 text-orange-500/50" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
