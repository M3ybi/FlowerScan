import type { User } from "@supabase/supabase-js";
import { LogOut, Trash2, UserRound } from "lucide-react";
import { signOut } from "../lib/authService";

type AccountMenuProps = {
  user: User;
};

export const AccountMenu = ({ user }: AccountMenuProps) => {
  const label = user.email ?? "Signed-in account";

  const confirmSignOut = () => {
    if (window.confirm("Sign out of Plantie on this device?")) {
      void signOut();
    }
  };

  return (
    <div className="account-menu" aria-label="Signed-in account">
      <span className="account-menu-user">
        <UserRound size={17} aria-hidden="true" />
        {label}
      </span>
      <a className="account-menu-link" href="#/delete-account">
        <Trash2 size={17} aria-hidden="true" />
        Delete account
      </a>
      <button type="button" onClick={confirmSignOut}>
        <LogOut size={17} aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
};
