import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  BuildingOffice2Icon,
  MusicalNoteIcon,
  UsersIcon,
  EnvelopeIcon,
  WalletIcon,
  ClockIcon,
  TicketIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import {
  MasterDetailLayout,
  MasterListItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sudobility/components";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useCreateWorkspace,
  useUpdateWorkspace,
  useMembers,
  useMyInvitations,
  useInviteMember,
  useWorkspaceInvitations,
  useWorkspaces,
  useMe,
  useUpdateMemberRole,
  useRemoveMember,
  useAcceptMyInvitation,
  useDeclineInvitation,
  useCancelInvitation,
  useCreditProducts,
  useCreditsBalance,
  useCreditPurchases,
  useCreditUsages,
  useScreenwriterClient,
  queryKeys,
} from "@sudobility/screenwriter_client";
import type { CreditCoupon } from "@sudobility/screenwriter_types";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import { useAuth } from "../app/AuthContext";
import { REVENUECAT_API_KEY, SHOW_ENTITIES } from "../config";
import { ProjectList, ProjectView } from "./DashboardPage";
import { useSetBreadcrumbs } from "../hooks/useBreadcrumbs";
import { useSetPageConfig } from "../hooks/usePageConfig";
import { useLang } from "../hooks/useLang";

// Saved locally so the app and project store keep using the same workspace across navigation/reloads.
const WORKSPACE_KEY = "screenwriter.selectedWorkspaceId";
type Section =
  | "projects"
  | "workspaces"
  | "members"
  | "invitations"
  | "credits"
  | "history"
  | "redeem"
  | "manage-coupons";
const button =
  "rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50";
const primary =
  "rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function UserDashboardPage({ projectId }: { projectId?: string }) {
  const { t } = useTranslation();
  useSetPageConfig({
    layoutMode: "full",
    maxWidth: "full",
    contentPadding: "none",
    scrollable: false,
  });
  const lang = useLang();
  const { user } = useAuth();
  const me = useMe();
  const workspaceQuery = useWorkspaces({ enabled: SHOW_ENTITIES });
  const workspaces = workspaceQuery.data?.items ?? [];
  const screenwriter = useScreenwriter();
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState(() =>
    !SHOW_ENTITIES || typeof localStorage === "undefined"
      ? ""
      : (localStorage.getItem(WORKSPACE_KEY) ?? ""),
  );
  const [section, setSection] = useState<Section>("projects");
  const [mobileView, setMobileView] = useState<"navigation" | "content">(
    "navigation",
  );
  const [admin, setAdmin] = useState(false);
  const client = useScreenwriterClient();

  useEffect(() => {
    const personal = me.data?.personalWorkspaceId;
    const valid = workspaces.some((w) => w.id === workspaceId);
    if (!workspaceId || (workspaces.length && !valid)) {
      const next =
        workspaces.find((w) => w.id === personal)?.id ??
        workspaces[0]?.id ??
        personal ??
        "";
      setWorkspaceId(next);
      if (next) localStorage.setItem(WORKSPACE_KEY, next);
    }
  }, [me.data?.personalWorkspaceId, workspaces, workspaceId]);
  useEffect(() => {
    void client
      .listCreditCoupons()
      .then(() => setAdmin(true))
      .catch(() => setAdmin(false));
  }, [client]);
  useEffect(() => {
    if (projectId) setSection("projects");
  }, [projectId]);
  useEffect(() => {
    if (section === "projects")
      void screenwriter.stores.projects.getState().load();
  }, [section, workspaceId, screenwriter]);

  const changeWorkspace = (id: string) => {
    setWorkspaceId(id);
    localStorage.setItem(WORKSPACE_KEY, id);
    void qc.invalidateQueries({ queryKey: queryKeys.creditsBalances() });
    void qc.invalidateQueries({ queryKey: queryKeys.sharing() });
    void screenwriter.stores.projects.getState().load();
  };
  const choose = (next: Section) => {
    setSection(next);
    setMobileView("content");
  };
  const all: {
    id: Section;
    label: string;
    description: string;
    icon: typeof MusicalNoteIcon;
  }[] = [
    {
      id: "workspaces",
      label: t("dashboard.workspaces", "Workspaces"),
      description: t("dashboard.workspaceDesc", "Manage your workspaces"),
      icon: BuildingOffice2Icon,
    },
    {
      id: "members",
      label: t("dashboard.members", "Members"),
      description: t("dashboard.membersDesc", "Manage workspace members"),
      icon: UsersIcon,
    },
    {
      id: "invitations",
      label: t("dashboard.invitations", "Invitations"),
      description: t(
        "dashboard.invitationsDesc",
        "Manage and respond to invitations",
      ),
      icon: EnvelopeIcon,
    },
    {
      id: "projects",
      label: t("dashboard.projects", "Projects"),
      description: t("dashboard.projectsDesc", "Browse your projects"),
      icon: MusicalNoteIcon,
    },
    {
      id: "credits",
      label: t("dashboard.creditPacks", "Credits"),
      description: t("dashboard.creditPacksDesc", "Purchase credit packs"),
      icon: WalletIcon,
    },
    {
      id: "history",
      label: t("dashboard.creditHistory", "Credit history"),
      description: t("dashboard.creditHistoryDesc", "Review credit activity"),
      icon: ClockIcon,
    },
    {
      id: "redeem",
      label: t("dashboard.redeemCoupon", "Redeem coupon"),
      description: t("dashboard.redeemCouponDesc", "Add credits with a coupon"),
      icon: TicketIcon,
    },
    ...(admin
      ? [
          {
            id: "manage-coupons" as const,
            label: t("dashboard.manageCoupons", "Manage Coupons"),
            description: t(
              "dashboard.manageCouponsDesc",
              "Create coupons and review redemptions",
            ),
            icon: TagIcon,
          },
        ]
      : []),
  ];
  const sections = SHOW_ENTITIES
    ? all
    : all.filter(
        (x) => !["workspaces", "members", "invitations"].includes(x.id),
      );
  const selected = sections.find((x) => x.id === section) ?? sections[0]!;
  const currentName =
    workspaces.find((w) => w.id === workspaceId)?.name ?? "Personal workspace";
  const detail = projectId ? (
    <ProjectView projectId={projectId} />
  ) : section === "projects" ? (
    <ProjectList />
  ) : section === "workspaces" && SHOW_ENTITIES ? (
    <WorkspacesView
      rows={workspaces}
      selectedId={workspaceId}
      onSelect={changeWorkspace}
    />
  ) : section === "members" && SHOW_ENTITIES ? (
    <MembersView
      workspaceId={workspaceId}
      canManage={["owner", "admin"].includes(
        workspaces.find((w) => w.id === workspaceId)?.role ?? "",
      )}
    />
  ) : section === "invitations" && SHOW_ENTITIES ? (
    <InvitationsView
      workspaceId={workspaceId}
      canManage={["owner", "admin"].includes(
        workspaces.find((w) => w.id === workspaceId)?.role ?? "",
      )}
    />
  ) : section === "credits" ? (
    <CreditStore
      workspaceId={workspaceId}
      userId={user?.uid ?? ""}
      onRedeem={() => choose("redeem")}
    />
  ) : section === "history" ? (
    <CreditHistory
      workspaceId={workspaceId}
      onPurchase={() => choose("credits")}
    />
  ) : section === "redeem" ? (
    <RedeemCoupon workspaceId={workspaceId} workspaceName={currentName} />
  ) : section === "manage-coupons" && admin ? (
    <ManageCoupons client={client} />
  ) : (
    <ProjectList />
  );

  useSetBreadcrumbs([
    { label: t("dashboard.title", "Dashboard"), href: `/${lang}/projects` },
    { label: selected.label, current: true },
  ]);
  return (
    <div className="h-full min-h-0 w-full min-w-0 flex-1">
      <MasterDetailLayout
        masterTitle={t("dashboard.title", "Your dashboard")}
        backButtonText={t("dashboard.title", "Dashboard")}
        masterContent={
          <div className="space-y-4 p-3">
            {SHOW_ENTITIES && (
              <div>
                <label
                  htmlFor="dashboard-workspace"
                  className="mb-1.5 block text-xs font-medium text-neutral-600"
                >
                  {t("dashboard.workspace", "Workspace")}
                </label>
                <Select value={workspaceId} onValueChange={changeWorkspace}>
                  <SelectTrigger id="dashboard-workspace" className="w-full">
                    <SelectValue
                      placeholder={t(
                        "dashboard.selectWorkspace",
                        "Select workspace",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <nav aria-label="Dashboard navigation" className="space-y-1">
              {sections.map((item) => (
                <MasterListItem
                  key={item.id}
                  isSelected={section === item.id}
                  onClick={() => choose(item.id)}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                />
              ))}
            </nav>
          </div>
        }
        detailContent={<div className="min-h-[400px]">{detail}</div>}
        detailTitle={selected.label}
        masterClassName="min-h-0 overflow-y-auto overscroll-contain"
        detailClassName="min-h-0 overflow-y-auto overscroll-contain"
        detailMaxWidth={1024}
        detailPadding
        masterWidth={280}
        stickyTopOffset={80}
        mobileView={mobileView}
        onBackToNavigation={() => setMobileView("navigation")}
        contentKey={`${section}:${workspaceId}:${projectId ?? ""}`}
      />
    </div>
  );
}

function WorkspacesView({
  rows,
  selectedId,
  onSelect,
}: {
  rows: { id: string; kind: string; name: string; role: string }[];
  selectedId: string;
  onSelect(id: string): void;
}) {
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace(selectedId);
  const selected = rows.find((w) => w.id === selectedId);
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState(selected?.name ?? "");
  useEffect(() => setWorkspaceName(selected?.name ?? ""), [selected?.name]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await create.mutateAsync({ name });
    setName("");
    onSelect(created.id);
  }
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <p className="mt-1 text-neutral-600">
          Choose a workspace or create one for your organization.
        </p>
      </header>
      {create.error && (
        <p role="alert" className="text-sm text-red-700">
          {create.error.message}
        </p>
      )}
      {update.error && (
        <p role="alert" className="text-sm text-red-700">
          {update.error.message}
        </p>
      )}
      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Organization name"
        />
        <button className={primary} disabled={create.isPending}>
          Create workspace
        </button>
      </form>
      <ul className="divide-y divide-neutral-200 rounded border">
        {rows.map((w) => (
          <li key={w.id}>
            <button
              onClick={() => onSelect(w.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="font-medium">{w.name}</span>
              <span className="text-sm text-neutral-500">
                {w.kind} · {w.role}
              </span>
              {w.id === selectedId && (
                <span className="ml-auto text-sm">Selected</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {selected?.kind === "team" &&
        ["owner", "admin"].includes(selected.role) && (
          <section className="rounded border p-5">
            <h2 className="text-lg font-medium">Workspace settings</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void update.mutateAsync({ name: workspaceName });
              }}
              className="mt-3 flex gap-2"
            >
              <input
                className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                aria-label="Workspace name"
              />
              <button
                className={button}
                disabled={update.isPending || workspaceName === selected.name}
              >
                Save name
              </button>
            </form>
          </section>
        )}
    </main>
  );
}
function MembersView({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const members = useMembers(workspaceId);
  const invite = useInviteMember();
  const updateRole = useUpdateMemberRole(workspaceId);
  const remove = useRemoveMember(workspaceId);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({
        target: { type: "workspace", id: workspaceId },
        body: { email, role: "writer" },
      });
      setEmail("");
      setNotice("Invitation sent.");
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Could not invite this member.",
      );
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold">Members</h1>
      {canManage && (
        <form onSubmit={(e) => void submit(e)} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
          />
          <button className={primary} disabled={invite.isPending}>
            Invite member
          </button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      <ul className="divide-y divide-neutral-200 rounded border">
        {members.data?.items.map((m) => (
          <li
            key={m.userId}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              {m.displayName ?? m.email ?? m.userId}
            </span>
            {canManage && m.role !== "owner" ? (
              <>
                <Select
                  value={m.role}
                  onValueChange={(role) =>
                    void updateRole.mutateAsync({
                      uid: m.userId,
                      role: role as "admin" | "writer" | "commenter" | "viewer",
                    })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="writer">Writer</SelectItem>
                    <SelectItem value="commenter">Commenter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  className={button}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${m.email ?? m.userId} from this workspace?`,
                      )
                    )
                      void remove.mutateAsync(m.userId);
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="text-sm text-neutral-500">{m.role}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
function InvitationsView({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const workspace = useWorkspaceInvitations(workspaceId);
  const mine = useMyInvitations();
  const accept = useAcceptMyInvitation();
  const decline = useDeclineInvitation();
  const cancel = useCancelInvitation();
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Invitations</h1>
      <section>
        <h2 className="mb-2 text-lg font-medium">Workspace invitations</h2>
        {workspace.data?.items.length ? (
          <ul className="divide-y rounded border">
            {workspace.data.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="flex-1">
                  {i.email} · {i.role} · {i.status}
                </span>
                {canManage && i.status === "pending" && (
                  <button
                    className={button}
                    onClick={() => void cancel.mutateAsync(i.id)}
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No workspace invitations.</p>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">Invitations to you</h2>
        {mine.data?.length ? (
          <ul className="divide-y rounded border">
            {mine.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="flex-1">
                  {i.targetName ?? i.workspaceId} · {i.role} · {i.status}
                </span>
                {i.status === "pending" && (
                  <>
                    <button
                      className={primary}
                      onClick={() => void accept.mutateAsync(i.id)}
                    >
                      Accept
                    </button>
                    <button
                      className={button}
                      onClick={() => void decline.mutateAsync(i.id)}
                    >
                      Decline
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No invitations to you.</p>
        )}
      </section>
    </main>
  );
}
function CreditStore({
  workspaceId,
  userId,
  onRedeem,
}: {
  workspaceId: string;
  userId: string;
  onRedeem(): void;
}) {
  const client = useScreenwriterClient();
  const balance = useCreditsBalance(workspaceId);
  const products = useCreditProducts();
  const qc = useQueryClient();
  const [offers, setOffers] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      if (!REVENUECAT_API_KEY) return;
      try {
        const { Purchases } = await import("@revenuecat/purchases-js");
        let rc: any;
        try {
          rc = Purchases.getSharedInstance();
          if (rc.getAppUserId() !== userId) await rc.changeUser(userId);
        } catch {
          rc = Purchases.configure({
            apiKey: REVENUECAT_API_KEY,
            appUserId: userId,
          });
        }
        const result = await rc.getOfferings();
        const list = Object.values(result.all).flatMap((offering: any) =>
          offering.availablePackages.map((pkg: any) => ({
            id: `${offering.identifier}::${pkg.identifier}`,
            offering: offering.identifier,
            pkg,
            product: pkg.rcBillingProduct,
          })),
        );
        if (live) setOffers(list);
      } catch (e) {
        if (live)
          setMessage(
            e instanceof Error
              ? e.message
              : "Could not load RevenueCat products.",
          );
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);
  const amounts = new Map(
    (products.data ?? []).map((p) => [p.productId.toLowerCase(), p.credits]),
  );
  async function buy(item: any) {
    setBusy(item.id);
    setMessage("");
    try {
      await client.setCreditPurchaseTarget(workspaceId);
      const { Purchases } = await import("@revenuecat/purchases-js");
      const rc = Purchases.getSharedInstance();
      await rc.purchase({ rcPackage: item.pkg });
      setMessage(
        "Purchase complete. Credits will appear when RevenueCat confirms the transaction.",
      );
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await qc.invalidateQueries({
          queryKey: queryKeys.creditsBalance(workspaceId),
        });
        void result;
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Purchase failed.");
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Credits</h1>
      </header>
      <section className="rounded-lg border border-neutral-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-700">Your balance</p>
        <p className="text-3xl font-bold">{balance.data?.balance ?? 0}</p>
      </section>
      {!REVENUECAT_API_KEY && (
        <p className="text-sm text-amber-700">
          Set a RevenueCat public API key in the VITE_REVENUECAT_API_KEY
          environment variables to show purchases.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((item) => {
          const credits = amounts.get(item.product.identifier.toLowerCase());
          return (
            <article
              key={item.id}
              className="rounded-xl border border-neutral-200 bg-white p-6 text-center"
            >
              <p className="text-3xl font-bold">{credits ?? "—"}</p>
              <p className="mt-1 text-sm text-neutral-500">credits</p>
              <p className="mt-3 text-lg font-semibold">
                {item.product.currentPrice.formattedPrice}
              </p>
              <button
                className={`${primary} mt-4 w-full`}
                disabled={!!busy || !credits}
                onClick={() => void buy(item)}
              >
                {busy === item.id ? "Purchasing…" : "Buy"}
              </button>
            </article>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onRedeem}
        className="text-sm font-medium text-blue-700 underline"
      >
        Redeem a credit coupon
      </button>
      {REVENUECAT_API_KEY && offers.length === 0 && (
        <p className="text-sm text-neutral-500">
          {products.isLoading
            ? "Loading products…"
            : "No RevenueCat offerings are available."}
        </p>
      )}
    </main>
  );
}

function CreditHistory({
  workspaceId,
  onPurchase,
}: {
  workspaceId: string;
  onPurchase(): void;
}) {
  const purchases = useCreditPurchases({ workspaceId });
  const usages = useCreditUsages({ workspaceId });
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center">
        <h1 className="text-2xl font-semibold">Credit history</h1>
        <button className={`${primary} ml-auto`} onClick={onPurchase}>
          Purchase credits
        </button>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-medium">Purchases</h2>
        <ul className="divide-y rounded border">
          {(purchases.data ?? []).map((x: any, i: number) => (
            <li key={x.id ?? i} className="flex justify-between p-3">
              <span>
                {x.product_id ?? x.source} · {x.credits} credits
              </span>
              <time>
                {new Date(x.created_at ?? x.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">Usage</h2>
        <ul className="divide-y rounded border">
          {(usages.data ?? []).map((x: any, i: number) => (
            <li key={x.id ?? i} className="flex justify-between p-3">
              <span>
                {x.reference ?? x.filename ?? "AI generation"} · −{x.credits}
              </span>
              <time>
                {new Date(x.created_at ?? x.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
function RedeemCoupon({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await client.redeemCreditCoupon(code, workspaceId);
      setMessage(
        `Added ${r.credits} credits to ${workspaceName}. New balance: ${r.balance}.`,
      );
      setCode("");
      await qc.invalidateQueries({
        queryKey: queryKeys.creditsBalance(workspaceId),
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Coupon redemption failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Redeem a credit coupon</h1>
        <p className="mt-1 text-neutral-600">
          Credits are added to {workspaceName}.
        </p>
      </header>
      <form
        onSubmit={(e) => void submit(e)}
        className="flex gap-2 rounded border p-5"
      >
        <input
          className="min-w-0 flex-1 rounded border px-3 py-2 font-mono uppercase"
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 8),
            )
          }
          minLength={8}
          maxLength={8}
          pattern="[A-Z0-9]{8}"
          placeholder="8-character code"
          required
        />
        <button className={primary} disabled={busy || code.length !== 8}>
          Redeem
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
function ManageCoupons({
  client,
}: {
  client: ReturnType<typeof useScreenwriterClient>;
}) {
  const [rows, setRows] = useState<CreditCoupon[]>([]);
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(
    () => client.listCreditCoupons().then((data) => setRows(data)),
    [client],
  );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const c = await client.createCreditCoupon({
        credits: Number(credits),
        expires_at: new Date(expiresAt).toISOString(),
        email: email.trim() || null,
      });
      setCode(c.code);
      setCredits("");
      setExpiresAt("");
      setEmail("");
      await load();
      setSelected(c.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coupon creation failed.");
    }
  }
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [rows],
  );
  const item = sorted.find((x) => x.code === selected);
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Manage Coupons</h1>
        <p className="mt-1 text-neutral-600">
          Create credit coupons and review their redemption history.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {code && (
        <p role="status">
          Coupon created: <strong className="font-mono">{code}</strong>
        </p>
      )}
      <section className="rounded border p-5">
        <h2 className="text-lg font-medium">Create a coupon</h2>
        <form
          onSubmit={(e) => void create(e)}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm">
            Credits
            <input
              className="mt-1 block w-full rounded border px-3 py-2"
              type="number"
              min="1"
              step="1"
              required
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Expires at
            <input
              className="mt-1 block w-full rounded border px-3 py-2"
              type="datetime-local"
              required
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Restrict to user email (optional)
            <input
              className="mt-1 block w-full rounded border px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className={primary}>Create 8-character coupon</button>
        </form>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">Coupons</h2>
        <ul className="divide-y rounded border">
          {sorted.map((c) => (
            <li key={c.id}>
              <button
                className="flex w-full justify-between gap-4 p-3 text-left"
                onClick={() => setSelected(c.code)}
              >
                <span className="font-mono">{c.code}</span>
                <span>
                  {c.credits} credits · {new Date(c.createdAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {item && (
        <section className="rounded border p-5">
          <h2 className="text-lg font-semibold">Coupon {item.code}</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <dt>Created</dt>
            <dd>{new Date(item.createdAt).toLocaleString()}</dd>
            <dt>Credits</dt>
            <dd>{item.credits}</dd>
            <dt>Expires</dt>
            <dd>{new Date(item.expiresAt).toLocaleString()}</dd>
            <dt>Target email</dt>
            <dd>{item.email ?? "Any user"}</dd>
          </dl>
          <h3 className="mt-5 font-medium">Redemption history</h3>
          {item.history.length ? (
            <ul className="mt-2 divide-y">
              {item.history.map((h, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span>
                    {h.userId} · {h.credits} credits
                  </span>
                  <time>{new Date(h.redeemedAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">No redemptions yet.</p>
          )}
        </section>
      )}
    </main>
  );
}
