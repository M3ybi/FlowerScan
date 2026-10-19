import { useEffect, useRef, useState } from "react";
import { callBackendFunction } from "../../../lib/backendConfig";
import type { PlantieLanguage } from "../../../lib/onboarding";
import { accountDeletionCopy } from "../accountDeletionCopy";

export const useAccountDeletion = (userId: string | null, language: PlantieLanguage | null, confirmation: string) => {
  const [deleteAccountStatus, setDeleteAccountStatus] = useState("");
  const [isRequestingAccountDeletion, setIsRequestingAccountDeletion] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  useEffect(() => {
    setDeleteAccountStatus("");
    setIsRequestingAccountDeletion(false);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [userId]);

  const requestAccountDeletion = async () => {
    const copy = accountDeletionCopy(language);
    if (pending.current) return;
    if (!userId) { setDeleteAccountStatus(copy.signIn); return; }
    if (!window.confirm(confirmation)) return;
    const controller = new AbortController();
    pending.current = controller;
    const isCurrent = () => !controller.signal.aborted && currentUser.current === userId;
    setIsRequestingAccountDeletion(true);
    setDeleteAccountStatus(copy.pending);
    try {
      const result = await callBackendFunction<{ requestId?: unknown; status?: unknown }>({
        allowNetlifyFallback: true, body: {}, signal: controller.signal,
        functionName: "delete-account-request", netlifyPath: "/.netlify/functions/delete-account-request",
      });
      if (!isCurrent()) return;
      if (typeof result?.requestId !== "string") throw new Error("Invalid deletion review response");
      setDeleteAccountStatus(result.status === "requested" ? copy.saved : result.status === "processing" ? copy.processing : result.status === "completed" ? copy.completed : copy.failed);
    } catch {
      if (isCurrent()) setDeleteAccountStatus(copy.failed);
    } finally {
      if (pending.current === controller) pending.current = null;
      if (isCurrent()) setIsRequestingAccountDeletion(false);
    }
  };
  return { deleteAccountStatus, setDeleteAccountStatus, isRequestingAccountDeletion, requestAccountDeletion };
};
