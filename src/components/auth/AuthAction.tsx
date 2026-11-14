/**
 * AuthAction — the top bar's account control.
 *
 * The dropdown/menu/sign-out rendering now lives in `building_blocks`'
 * `AuthActionView` (injected into the topbar as its `AuthActionComponent`);
 * this adapter only binds the app's own `useAuth()` state and supplies the
 * local initials avatar. Logged out → a "Log in" button; logged in → the
 * initials avatar opening a dropdown of the given menu items plus "Sign out".
 */
import { AuthActionView } from "@sudobility/building_blocks";
import type { AuthActionProps, AuthActionUser } from "@sudobility/building_blocks";
import { useAuth } from "../../app/AuthContext";

export function AuthAction(props: AuthActionProps) {
  const { user, signOut } = useAuth();
  const size = props.avatarSize ?? 32;

  const renderAvatar = (u: AuthActionUser) => (
    <button
      type="button"
      aria-label={u.email ?? "Account"}
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-80 transition-opacity"
    >
      {(u.displayName ?? u.email ?? "?").slice(0, 2).toUpperCase()}
    </button>
  );

  return (
    <AuthActionView
      {...props}
      user={user}
      onSignOut={() => void signOut()}
      signOutLabel="Sign out"
      loginButtonText={props.loginButtonText ?? "Log in"}
      renderAvatar={renderAvatar}
    />
  );
}
