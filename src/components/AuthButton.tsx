import { useState } from "react";
import { UserRound } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { isSupabaseConfigured } from "../lib/supabase";
import { AccountMenu } from "./AccountMenu";
import { AuthModal } from "./AuthModal";

export const AuthButton = () => {
  const { isAuthenticated, loading, user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!isSupabaseConfigured) {
    return null;
  }

  if (isAuthenticated && user) {
    return <AccountMenu user={user} />;
  }

  return (
    <>
      <button className="qr-action auth-trigger" type="button" onClick={() => setIsModalOpen(true)} disabled={loading}>
        <UserRound size={20} aria-hidden="true" />
        {loading ? "Kontrolujem účet" : "Prihlásiť"}
      </button>
      {isModalOpen ? <AuthModal onClose={() => setIsModalOpen(false)} /> : null}
    </>
  );
};

