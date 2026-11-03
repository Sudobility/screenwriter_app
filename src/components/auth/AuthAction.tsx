import type { AuthActionProps } from "@sudobility/building_blocks";
import { Button, Dropdown } from "@sudobility/components";
import { useAuth } from "../../app/AuthContext";

/**
 * AuthAction — the top bar's account control.
 *
 * Fed to `building_blocks`' topbar as its `AuthActionComponent` — that component is injected as a prop rather than
 * hard-imported so `building_blocks` has no hard dependency on any specific auth provider (its own doc comment).
 * This app owns its auth *state* (`src/app/AuthContext`, a service-based context over `screenwriter_lib`'s
 * `AuthBackend`), so the only shared piece is this presentational control. It used to borrow the `Avatar` from
 * the components library's auth subpath, which is going away; it now renders the avatar locally (initials),
 * mirroring the web apps' app-local `AuthAction` (shapeshyft_app / sudojo_app).
 *
 * Logged out → a "Log in" button. Logged in → an initials avatar that opens a dropdown of the given menu items
 * plus "Sign out".
 */
export function AuthAction({
  onLoginClick,
  menuItems = [],
  avatarSize,
  dropdownAlign,
  loginButtonText,
  loginButtonClassName,
}: AuthActionProps) {
  const { user, signOut } = useAuth();

  if (!user) {
    // The library's own Button (variant="primary") — not a hand-rolled button, so it picks up the active theme's
    // real button styling instead of an arbitrary color.
    return (
      <Button
        type="button"
        variant="primary"
        onClick={() => onLoginClick?.()}
        className={loginButtonClassName}
        data-testid="log-in-button"
      >
        {loginButtonText ?? "Log in"}
      </Button>
    );
  }

  const initials = (user.displayName ?? user.email ?? "?").slice(0, 2).toUpperCase();
  const size = avatarSize ?? 32;

  return (
    <Dropdown
      align={dropdownAlign}
      trigger={
        <span data-testid="account-menu">
          <button
            type="button"
            aria-label={user.email ?? "Account"}
            style={{ width: size, height: size }}
            className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-80 transition-opacity"
          >
            {initials}
          </button>
        </span>
      }
      items={[
        ...menuItems.map((m) => ({ id: m.id, label: m.label, onClick: m.onClick ?? (() => {}) })),
        { id: "sign-out", label: "Sign out", onClick: () => void signOut() },
      ]}
    />
  );
}
