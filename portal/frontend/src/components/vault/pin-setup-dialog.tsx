"use client";

import { useState, useCallback, useEffect } from "react";
import { Lock, Delete, CheckCircle2, Loader2 } from "lucide-react";
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

interface PinSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PIN_LENGTH = 6;

type SetupStep = 1 | 2;
type SetupState = "entering" | "error" | "submitting" | "success";

export function PinSetupDialog({
  isOpen,
  onClose,
  onSuccess,
}: PinSetupDialogProps) {
  const [step, setStep] = useState<SetupStep>(1);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [state, setState] = useState<SetupState>("entering");
  const [errorMessage, setErrorMessage] = useState("");

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPin("");
      setFirstPin("");
      setState("entering");
      setErrorMessage("");
    }
  }, [isOpen]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (state === "submitting" || state === "success") return;
      if (pin.length >= PIN_LENGTH) return;

      const newPin = pin + digit;
      setPin(newPin);

      if (state === "error") {
        setState("entering");
        setErrorMessage("");
      }

      if (newPin.length === PIN_LENGTH) {
        if (step === 1) {
          // Move to step 2
          setFirstPin(newPin);
          setPin("");
          setStep(2);
        } else {
          // Step 2: check match and submit
          if (newPin === firstPin) {
            submitPin(firstPin, newPin);
          } else {
            setState("error");
            setErrorMessage("PINs do not match. Please start over.");
            setTimeout(() => {
              setStep(1);
              setPin("");
              setFirstPin("");
              setState("entering");
              setErrorMessage("");
            }, 1500);
          }
        }
      }
    },
    [pin, state, step, firstPin]
  );

  const handleBackspace = useCallback(() => {
    if (state === "submitting" || state === "success") return;
    setPin((prev) => prev.slice(0, -1));
    if (state === "error") {
      setState("entering");
      setErrorMessage("");
    }
  }, [state]);

  const submitPin = async (pinValue: string, confirmation: string) => {
    setState("submitting");
    try {
      await vaultPinService.setup(pinValue, confirmation);
      setState("success");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (error) {
      setState("error");
      if (axios.isAxiosError(error)) {
        const message =
          error.response?.data?.message || "Failed to set up PIN. Try again.";
        setErrorMessage(message);
      } else {
        setErrorMessage("An error occurred. Please try again.");
      }
      // Reset to step 1
      setTimeout(() => {
        setStep(1);
        setPin("");
        setFirstPin("");
        setState("entering");
        setErrorMessage("");
      }, 2000);
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

  const stepTitle = step === 1 ? "Enter your new PIN" : "Confirm your PIN";
  const stepDescription =
    step === 1
      ? "Choose a 6-digit PIN for your vault"
      : "Enter the same PIN again to confirm";

  if (state === "success") {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent showCloseButton={false} className="sm:max-w-[320px] p-6">
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm font-medium">Vault PIN set up successfully!</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[320px] p-6">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle className="text-center">{stepTitle}</DialogTitle>
          <DialogDescription className="text-center">
            {stepDescription}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
              step === 1
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            1
          </span>
          <span className="w-4 border-t border-muted-foreground/30" />
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
              step === 2
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            2
          </span>
        </div>

        {/* PIN Dots */}
        <div className="flex items-center justify-center gap-3 py-4">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-3 w-3 rounded-full transition-all duration-150",
                i < pin.length
                  ? state === "error"
                    ? "bg-red-500"
                    : "bg-primary scale-110"
                  : "bg-muted-foreground/20"
              )}
            />
          ))}
          {state === "submitting" && (
            <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <p className="text-center text-xs font-medium text-red-500">
            {errorMessage}
          </p>
        )}

        {/* Numpad */}
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
                    disabled={state === "submitting"}
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
                  disabled={state === "submitting"}
                  className="flex h-14 w-full items-center justify-center rounded-lg text-lg font-medium transition-colors hover:bg-muted active:bg-muted/80 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {key}
                </button>
              );
            }
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
