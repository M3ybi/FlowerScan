import { X } from "lucide-react";
import { useState } from "react";
import { getBillingService } from "../lib/billingService";

type UpgradeModalProps = {
  limitReason?: string;
  onClose: () => void;
};

const billing = getBillingService();

const disabledLabel = () => {
  const status = billing.getStatus();
  if (status.disabledReason === "web") {
    return "Available in mobile app";
  }

  if (status.disabledReason === "missing_config") {
    return "Billing not configured";
  }

  return "";
};

export const UpgradeModal = ({ limitReason = "Tato funkcia bude sucastou Plantie Premium.", onClose }: UpgradeModalProps) => {
  const [statusMessage, setStatusMessage] = useState(disabledLabel());
  const [isPurchasing, setIsPurchasing] = useState(false);
  const billingStatus = billing.getStatus();
  const billingDisabled = !billingStatus.configured;

  const purchase = async (period: "monthly" | "yearly") => {
    try {
      setIsPurchasing(true);
      setStatusMessage("Opening secure store purchase...");
      if (period === "monthly") {
        await billing.purchasePremiumMonthly();
      } else {
        await billing.purchasePremiumYearly();
      }
      await billing.syncEntitlements();
      setStatusMessage("Purchase submitted. Premium activates only after server entitlement confirmation.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Purchase failed safely.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Zavriet upgrade">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="section-title">
          <h2 id="upgrade-title">Upgrade na Premium</h2>
        </div>
        <p>{limitReason}</p>
        <ul>
          <li>Neobmedzene AI skeny</li>
          <li>Neobmedzene rastliny a QR stitky</li>
          <li>AI diagnostika chorob</li>
          <li>Cloud backup a zdielanie domacnosti</li>
        </ul>
        {statusMessage ? <p className="report-status">{statusMessage}</p> : null}
        <div className="upgrade-actions">
          <button className="primary-action" type="button" disabled={billingDisabled || isPurchasing} onClick={() => void purchase("monthly")}>
            {billingDisabled ? disabledLabel() : "Premium Monthly"}
          </button>
          <button className="neutral-action" type="button" disabled={billingDisabled || isPurchasing} onClick={() => void purchase("yearly")}>
            {billingDisabled ? disabledLabel() : "Premium Yearly"}
          </button>
        </div>
      </section>
    </div>
  );
};
