import { useEffect, useState } from "react";
import type { AuthNotice } from "../../../components/AuthPanel";
import type { AuthState } from "../../../hooks/useAuth";
import type { AuthMode } from "../../../lib/authRules";
import { finishPasswordRecovery } from "../../../lib/authService";

export const useRecoveryActions = (auth: AuthState) => {
  const [authEntry, setAuthEntry] = useState<{ id: number; mode: AuthMode; email: string; notice?: AuthNotice } | null>(null);
  const [isLeavingRecovery, setIsLeavingRecovery] = useState(false);
  const [recoveryExitFailed, setRecoveryExitFailed] = useState(false);
  useEffect(() => setRecoveryExitFailed(false), [auth.recoveryFlowId]);
  const completeRecovery = async (email: string | null) => {
    const flowId = auth.beginPasswordRecoveryCompletion(auth.recoveryFlowId);
    if (flowId === null) return;
    await finishPasswordRecovery();
    if (!auth.completePasswordRecovery(flowId)) return;
    setAuthEntry({ id: Date.now(), mode: "login", email: email ?? "", notice: { key: "password_changed", severity: "success" } });
    window.location.hash = "#/menu?section=account";
  };
  const requestNewRecoveryLink = async (email = auth.user?.email ?? "") => {
    if (isLeavingRecovery) return;
    const flowId = auth.recoveryFlowId;
    setIsLeavingRecovery(true);
    setRecoveryExitFailed(false);
    try {
      await finishPasswordRecovery();
      if (!auth.completePasswordRecovery(flowId)) return;
      setAuthEntry({ id: Date.now(), mode: "reset", email: email || auth.user?.email || "" });
      window.location.hash = "#/menu?section=account";
    } catch {
      if (auth.isPasswordRecoveryFlowCurrent(flowId)) setRecoveryExitFailed(true);
    } finally {
      setIsLeavingRecovery(false);
    }
  };

  return { authEntry, setAuthEntry, isLeavingRecovery, recoveryExitFailed, completeRecovery, requestNewRecoveryLink };
};
