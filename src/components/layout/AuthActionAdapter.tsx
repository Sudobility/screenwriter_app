import { useNavigate } from "react-router-dom";
import type { AuthActionProps } from "@sudobility/building_blocks";
import { Avatar } from "@sudobility/auth-components";
import { Button, Dropdown } from "@sudobility/components";
import { useAuth } from "../../app/AuthContext";
import { useLang } from "../../hooks/useLang";

/**
 * Fed to `building_blocks`' topbar as its `AuthActionComponent` — that component is injected as a prop rather
 * than hard-imported so `building_blocks` has no hard dependency on any specific auth provider (its own doc
 * comment). This app has its own auth context (not `@sudobility/auth-components`' own Firebase-config-driven
 * `AuthProvider`), so this adapter bridges the two, matching music_app's own `AuthActionAdapter.tsx`: reads this
 * app's `useAuth()`, renders `auth-components`' presentational `Avatar` (a `user` prop, no context needed) inside
 * `components`' `Dropdown`.
 */
export function AuthActionAdapter({ onLoginClick, menuItems = [], avatarSize, dropdownAlign }: AuthActionProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const lang = useLang();

  if (!user) {
    // The library's own Button (variant="primary"), matching music_app's AuthActionAdapter exactly — not a
    // hand-rolled button, so it picks up the active theme's real button styling instead of an arbitrary color.
    return (
      <Button type="button" variant="primary" onClick={() => onLoginClick?.()} data-testid="log-in-button">
        Log in
      </Button>
    );
  }

  return (
    <Dropdown
      align={dropdownAlign}
      trigger={
        <span data-testid="account-menu">
          <Avatar
            user={{
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: null,
              isAnonymous: false,
              emailVerified: true,
              providerId: null,
            }}
            size={avatarSize}
          />
        </span>
      }
      items={[
        { id: "keys", label: "API keys", onClick: () => navigate(`/${lang}/settings/keys`) },
        ...menuItems.map((m) => ({ id: m.id, label: m.label, onClick: m.onClick ?? (() => {}) })),
        { id: "sign-out", label: "Sign out", onClick: () => void signOut() },
      ]}
    />
  );
}
