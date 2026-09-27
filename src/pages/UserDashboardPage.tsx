import {
  useEffect,
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
  useCreateEntity,
  useUpdateEntity,
  useMembers,
  useMyInvitations,
  useInviteMember,
  useEntityInvitations,
  useManagedEntities,
  useMe,
  useUpdateMemberRole,
  useRemoveMember,
  useAcceptMyInvitation,
  useDeclineInvitation,
  useCancelInvitation,
  queryKeys,
} from "@sudobility/screenwriter_client";
import {
  refreshConsumablesBalance,
  useBalance,
  useConsumableProducts,
  usePurchaseCredits,
} from "@sudobility/consumables_client";
import {
  CreditStorePage,
  CreditHistoryPage,
  ManageCreditCouponsPage,
  RedeemCreditCouponPage,
} from "@sudobility/consumables_pages";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import { useAuth } from "../app/AuthContext";
import { REVENUECAT_API_KEY, SHOW_ENTITIES } from "../config";
import { ProjectList, ProjectView } from "./DashboardPage";
import { useSetBreadcrumbs } from "../hooks/useBreadcrumbs";
import { useSetPageConfig } from "../hooks/usePageConfig";
import { useLang } from "../hooks/useLang";
import { getServices } from "../services";

// Saved locally so the app and project store keep using the same workspace across navigation/reloads.
const WORKSPACE_KEY = "screenwriter.selectedEntityId";
const LEGACY_WORKSPACE_KEY = "screenwriter.selectedWorkspaceId";
type Section =
  | "projects"
  | "entities"
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
  const workspaceQuery = useManagedEntities({ enabled: SHOW_ENTITIES });
  const entities = workspaceQuery.data?.items ?? [];
  const screenwriter = useScreenwriter();
  const qc = useQueryClient();
  const [entityId, setEntityId] = useState(() =>
    !SHOW_ENTITIES || typeof localStorage === "undefined"
      ? ""
      : (localStorage.getItem(WORKSPACE_KEY) ?? localStorage.getItem(LEGACY_WORKSPACE_KEY) ?? ""),
  );
  const [section, setSection] = useState<Section>("projects");
  const [mobileView, setMobileView] = useState<"navigation" | "content">(
    "navigation",
  );
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    const personal = me.data?.personalEntityId;
    const valid = entities.some((w) => w.id === entityId);
    if (!entityId || (entities.length && !valid)) {
      const next =
        entities.find((w) => w.id === personal)?.id ??
        entities[0]?.id ??
        personal ??
        "";
      setEntityId(next);
      if (next) {
        localStorage.setItem(WORKSPACE_KEY, next);
        localStorage.removeItem(LEGACY_WORKSPACE_KEY);
        void refreshConsumablesBalance().catch(() => undefined);
      }
    }
  }, [me.data?.personalEntityId, entities, entityId]);
  useEffect(() => {
    void getServices().consumablesApiClient
      .listCreditCoupons()
      .then(() => setAdmin(true))
      .catch(() => setAdmin(false));
  }, []);
  useEffect(() => {
    if (projectId) setSection("projects");
  }, [projectId]);
  useEffect(() => {
    if (section === "projects")
      void screenwriter.stores.projects.getState().load();
  }, [section, entityId, screenwriter]);

  const changeWorkspace = (id: string) => {
    setEntityId(id);
    localStorage.setItem(WORKSPACE_KEY, id);
    void refreshConsumablesBalance().catch(() => undefined);
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
      id: "entities",
      label: t("dashboard.entities", "Workspaces"),
      description: t("dashboard.workspaceDesc", "Manage your entities"),
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
        (x) => !["entities", "members", "invitations"].includes(x.id),
      );
  const selected = sections.find((x) => x.id === section) ?? sections[0]!;
  const currentName =
    entities.find((w) => w.id === entityId)?.name ?? "Personal workspace";
  const detail = projectId && section === "projects" ? (
    <ProjectView projectId={projectId} />
  ) : section === "projects" ? (
    <ProjectList />
  ) : section === "entities" && SHOW_ENTITIES ? (
    <WorkspacesView
      rows={entities}
      selectedId={entityId}
      onSelect={changeWorkspace}
    />
  ) : section === "members" && SHOW_ENTITIES ? (
    <MembersView
      entityId={entityId}
      canManage={["owner", "admin"].includes(
        entities.find((w) => w.id === entityId)?.role ?? "",
      )}
    />
  ) : section === "invitations" && SHOW_ENTITIES ? (
    <InvitationsView
      entityId={entityId}
      canManage={["owner", "admin"].includes(
        entities.find((w) => w.id === entityId)?.role ?? "",
      )}
    />
  ) : section === "credits" ? (
    <CreditStore
      entityId={entityId}
      userId={user?.uid ?? ""}
      onRedeem={() => choose("redeem")}
    />
  ) : section === "history" ? (
    <CreditHistory onPurchase={() => choose("credits")} />
  ) : section === "redeem" ? (
    <RedeemCoupon entityId={entityId} workspaceName={currentName} />
  ) : section === "manage-coupons" && admin ? (
    <ManageCoupons />
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
                <Select value={entityId} onValueChange={changeWorkspace}>
                  <SelectTrigger id="dashboard-workspace" className="w-full">
                    <SelectValue
                      placeholder={t(
                        "dashboard.selectWorkspace",
                        "Select workspace",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((w) => (
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
        contentKey={`${section}:${entityId}:${projectId ?? ""}`}
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
  const create = useCreateEntity();
  const update = useUpdateEntity(selectedId);
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
  entityId,
  canManage,
}: {
  entityId: string;
  canManage: boolean;
}) {
  const members = useMembers(entityId);
  const invite = useInviteMember();
  const updateRole = useUpdateMemberRole(entityId);
  const remove = useRemoveMember(entityId);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({
        target: { type: "entity", id: entityId },
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
  entityId,
  canManage,
}: {
  entityId: string;
  canManage: boolean;
}) {
  const workspace = useEntityInvitations(entityId);
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
                  {i.targetName ?? i.entityId} · {i.role} · {i.status}
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
  entityId,
  userId,
  onRedeem,
}: {
  entityId: string;
  userId: string;
  onRedeem(): void;
}) {
  const { t } = useTranslation();
  const { consumablesApiClient } = getServices();
  const balanceState = useBalance();
  const productState = useConsumableProducts("");
  const purchaseState = usePurchaseCredits();
  async function purchase(packageId: string) {
    const selected = productState.packages.find(pkg => pkg.packageId === packageId);
    if (!selected?.offeringId) throw new Error('This credit package is no longer available.');
    await purchaseState.purchase(selected.storePackageId ?? selected.packageId, selected.offeringId);
  }
  return <CreditStorePage
    isAuthenticated={Boolean(userId)}
    balance={balanceState.balance}
    packages={productState.packages}
    isLoading={balanceState.isLoading || productState.isLoading}
    isPurchasing={purchaseState.isPurchasing}
    error={purchaseState.error?.message ?? balanceState.error?.message ?? productState.error?.message ?? null}
    onPurchase={purchase}
    onLoginClick={() => {}}
    labels={{
      title: '',
      currentBalanceLabel: 'Your balance',
      creditsUnit: 'credits',
      purchaseButton: 'Buy',
      purchasingButton: 'Purchasing…',
      noProducts: REVENUECAT_API_KEY ? 'No RevenueCat offerings are available.' : 'Set VITE_REVENUECAT_API_KEY to show purchases.',
      errorTitle: 'Credit store error',
      loginRequired: 'Sign in to purchase credits.',
    }}
    formatters={{ formatCredits: value => value.toLocaleString(), getPackageDescription: () => 'Credits for AI writing.' }}
  />;
}

function CreditHistory({ onPurchase }: { onPurchase(): void }) {
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };
  return <main className="mx-auto max-w-4xl space-y-5">
    <h1 className="flex items-center text-2xl font-semibold">Credit history<button className={`${primary} ml-auto`} onClick={onPurchase}>Purchase credits</button></h1>
    <CreditHistoryPage
      purchaseLabels={{ title: 'Purchases', columnDate: 'Date', columnCredits: 'Credits', columnSource: 'Source', columnProduct: 'Product', columnAmount: 'Amount', noRecords: 'No purchases yet.', loadMore: 'Load more' }}
      purchaseFormatters={{ formatDate, formatAmount: (cents, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100), formatSource: source => source }}
      usageLabels={{ title: 'Usage', columnDate: 'Date', columnFilename: 'Activity', columnCredits: 'Credits', noRecords: 'No usage yet.', loadMore: 'Load more' }}
      usageFormatters={{ formatDate }}
    />
  </main>;
}

function RedeemCoupon({ entityId, workspaceName }: { entityId: string; workspaceName: string }) {
  const { consumablesApiClient } = getServices();
  const qc = useQueryClient();
  return <RedeemCreditCouponPage
    client={consumablesApiClient}
    entityId={entityId}
    entityName={workspaceName}
    onRedeemed={() => qc.invalidateQueries({ queryKey: queryKeys.creditsBalance(entityId) })}
  />;
}

function ManageCoupons() {
  const { consumablesApiClient } = getServices();
  return <ManageCreditCouponsPage client={consumablesApiClient} isAdmin />;
}
