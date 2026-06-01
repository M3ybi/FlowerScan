import type { User } from "@supabase/supabase-js";
import { LogOut, UserRound } from "lucide-react";
import { signOut } from "../lib/authService";

type AccountMenuProps = {
  user: User;
};

export const AccountMenu = ({ user }: AccountMenuProps) => {
  const label = user.email ?? "Prihlásený účet";

  return (
    <div className="account-menu" aria-label="Prihlásený účet">
      <span className="account-menu-user">
        <UserRound size={17} aria-hidden="true" />
        {label}
      </span>
      <button type="button" onClick={() => void signOut()}>
        <LogOut size={17} aria-hidden="true" />
        Odhlásiť
      </button>
    </div>
  );
};

