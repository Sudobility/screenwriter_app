import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DOCUMENT_KINDS, type DocumentKind } from "@sudobility/screenwriter_types";
import { useDocuments, useProjects, useTemplates } from "@sudobility/screenwriter_lib";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { useLang } from "../hooks/useLang";
import { useSetBreadcrumbs } from "../hooks/useBreadcrumbs";
import { ImportScript } from "../components/ImportScript";

const btn = "border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50";
// `SelectTrigger` (from mail_box_components) is a fixed `h-9`; the title input and submit button match
// it exactly (same height as the two selects, per an explicit user requirement) instead of each control
// following its own padding/font-size.
const fieldClass = "h-9 border border-neutral-300 rounded px-3 text-sm text-neutral-900";
const primaryField = "h-9 inline-flex items-center justify-center bg-neutral-900 text-white rounded px-3 text-sm disabled:opacity-50";

export function DashboardPage() {
  const { projectId } = useParams();
  return projectId ? <ProjectView projectId={projectId} /> : <ProjectList />;
}

function ProjectList() {
  const { t } = useTranslation();
  const lang = useLang();
  const { projects, showingTrash, loading, error, load, create, trash, restore } = useProjects();
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const created = await create({ name });
    if (created) {
      setName("");
      navigate(`/${lang}/p/${created.id}`);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">{showingTrash ? t("dashboard.trashedProjects") : t("dashboard.projects")}</h2>
        <button className={`${btn} ml-auto`} onClick={() => void load({ trashed: !showingTrash })}>
          {showingTrash ? t("dashboard.backToProjects") : t("dashboard.showTrash")}
        </button>
      </div>
      {!showingTrash && (
        <form onSubmit={(e) => void submit(e)} className="flex gap-2 mb-4">
          <input
            aria-label={t("dashboard.newProjectNameLabel")}
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("dashboard.newProjectNameLabel")}
            className="flex-1 border border-neutral-300 rounded px-3 py-1.5"
          />
          <button type="submit" className={primary}>
            {t("dashboard.createProject")}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {loading && projects.length === 0 && <p className="text-sm text-neutral-500">{t("common.loading")}</p>}
      {!loading && projects.length === 0 && (
        <p className="text-sm text-neutral-500">{showingTrash ? t("dashboard.trashEmpty") : t("dashboard.noProjects")}</p>
      )}
      <ul className="space-y-2">
        {projects.map(p => (
          <li
            key={p.id}
            className={`relative bg-white border border-neutral-200 rounded px-4 py-3 flex items-center gap-3 ${showingTrash ? "" : "hover:bg-neutral-50"}`}
            data-testid="project-row"
          >
            {/* Covers the whole row so clicking anywhere (not just the title) navigates — the visible title below
             * stays plain text; the Trash/Restore button sits above this via z-10 so its own click still wins. */}
            {!showingTrash && <Link to={`/${lang}/p/${p.id}`} className="absolute inset-0 rounded" aria-label={p.name} />}
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-neutral-500">{t("dashboard.documentCount", { count: p.documentCount })}</span>
            <button className={`${btn} ml-auto relative z-10`} onClick={() => void (showingTrash ? restore(p.id) : trash(p.id))}>
              {showingTrash ? t("dashboard.restore") : t("dashboard.trash")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectView({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { documents, showingTrash, loading, error, load, trash, restore } = useDocuments(projectId);
  const { projects } = useProjects();
  const project = projects.find(p => p.id === projectId);

  // The real breadcrumbs system (building_blocks' AppBreadcrumbs, via ScreenContainer's BreadcrumbContext),
  // not a hand-rolled "Projects / name" line — matches music_app's own per-page useSetBreadcrumbs usage.
  useSetBreadcrumbs([
    { label: t("dashboard.projects"), href: `/${lang}/projects` },
    { label: project?.name ?? projectId, current: true },
  ]);

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">{showingTrash ? t("dashboard.trashedDocuments") : t("dashboard.documents")}</h2>
        <button className={`${btn} ml-auto`} onClick={() => void load({ trashed: !showingTrash })}>
          {showingTrash ? t("dashboard.backToDocuments") : t("dashboard.showTrash")}
        </button>
      </div>
      {!showingTrash && <NewDocumentForm projectId={projectId} />}
      <ImportScript projectId={projectId}>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {loading && documents.length === 0 && <p className="text-sm text-neutral-500">{t("common.loading")}</p>}
        {!loading && documents.length === 0 && (
          <p className="text-sm text-neutral-500">{showingTrash ? t("dashboard.trashEmpty") : t("dashboard.noDocuments")}</p>
        )}
        <ul className="space-y-2">
          {documents.map(d => (
            <li
              key={d.id}
              className={`relative bg-white border border-neutral-200 rounded px-4 py-3 flex items-center gap-3 ${showingTrash ? "" : "hover:bg-neutral-50"}`}
              data-testid="document-row"
            >
              {/* Covers the whole row so clicking anywhere (not just the title) navigates — see the matching
               * comment on the project row above. */}
              {!showingTrash && <Link to={`/${lang}/d/${d.id}`} className="absolute inset-0 rounded" aria-label={d.title} />}
              <span className="font-medium">{d.title}</span>
              <span className="text-xs text-neutral-500">
                {t("dashboard.documentMeta", {
                  kind: d.kind,
                  words: d.wordCount,
                  edited: new Date(d.lastEditedAt ?? d.updatedAt).toLocaleString(),
                })}
              </span>
              <button className={`${btn} ml-auto relative z-10`} onClick={() => void (showingTrash ? restore(d.id) : trash(d.id))}>
                {showingTrash ? t("dashboard.restore") : t("dashboard.trash")}
              </button>
            </li>
          ))}
        </ul>
      </ImportScript>
    </section>
  );
}

function NewDocumentForm({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { create } = useDocuments(projectId);
  // Built-ins are filtered to the app's current UI language (screenwriter_lib's business logic; see useTemplates'
  // own doc comment) — a user in English shouldn't see the catalogue's zh-Hans/zh-Hant/ja/ko/es/fr/de variants.
  const { templates } = useTemplates(lang);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("script");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);

  // Default template: the standard screenplay one.
  useEffect(() => {
    if (templateId || templates.length === 0) return;
    const def = templates.find(t => t.builtinKey === "screenplay-standard") ?? templates.find(t => /screenplay/i.test(t.name)) ?? templates[0];
    if (def) setTemplateId(def.id);
  }, [templates, templateId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const doc = await create({ title, kind, ...(templateId ? { templateId } : {}) });
      if (doc) {
        setTitle("");
        navigate(`/${lang}/d/${doc.id}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="bg-white border border-neutral-200 rounded p-3 mb-4 flex flex-wrap gap-2 items-end"
      aria-label={t("dashboard.newDocumentFormLabel")}
    >
      <label className="flex flex-col text-xs text-neutral-500 flex-1 min-w-40">
        {t("dashboard.titleLabel")}
        <input
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t("dashboard.titlePlaceholder")}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        {t("dashboard.kindLabel")}
        <Select value={kind} onValueChange={v => setKind(v as DocumentKind)}>
          <SelectTrigger aria-label={t("dashboard.kindLabel")} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_KINDS.map(k => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        {t("dashboard.templateLabel")}
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger aria-label={t("dashboard.templateLabel")} className="w-48">
            <SelectValue placeholder={t("dashboard.templateLabel")} />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <button type="submit" disabled={busy} className={primaryField}>
        {t("dashboard.createDocument")}
      </button>
    </form>
  );
}
