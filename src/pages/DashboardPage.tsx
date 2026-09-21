import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DOCUMENT_KINDS, type DocumentKind } from "@sudobility/screenwriter_types";
import { useDocuments, useProjects, useTemplates } from "@sudobility/screenwriter_lib";
import { Shell } from "../components/Shell";
import { ImportScript } from "../components/ImportScript";

const btn = "border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50";

export function DashboardPage() {
  const { projectId } = useParams();
  return <Shell>{projectId ? <ProjectView projectId={projectId} /> : <ProjectList />}</Shell>;
}

function ProjectList() {
  const { projects, showingTrash, loading, error, load, create, trash, restore } = useProjects();
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const created = await create({ name });
    if (created) {
      setName("");
      navigate(`/p/${created.id}`);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">{showingTrash ? "Trashed projects" : "Projects"}</h2>
        <button className={`${btn} ml-auto`} onClick={() => void load({ trashed: !showingTrash })}>
          {showingTrash ? "Back to projects" : "Show trash"}
        </button>
      </div>
      {!showingTrash && (
        <form onSubmit={submit} className="flex gap-2 mb-4">
          <input
            aria-label="New project name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="New project name"
            className="flex-1 border border-neutral-300 rounded px-3 py-1.5"
          />
          <button type="submit" className={primary}>
            Create project
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {loading && projects.length === 0 && <p className="text-sm text-neutral-500">Loading...</p>}
      {!loading && projects.length === 0 && <p className="text-sm text-neutral-500">{showingTrash ? "Trash is empty." : "No projects yet."}</p>}
      <ul className="space-y-2">
        {projects.map(p => (
          <li key={p.id} className="bg-white border border-neutral-200 rounded px-4 py-3 flex items-center gap-3" data-testid="project-row">
            {showingTrash ? (
              <span className="font-medium">{p.name}</span>
            ) : (
              <Link to={`/p/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
            )}
            <span className="text-xs text-neutral-500">{p.documentCount} documents</span>
            <button className={`${btn} ml-auto`} onClick={() => void (showingTrash ? restore(p.id) : trash(p.id))}>
              {showingTrash ? "Restore" : "Trash"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectView({ projectId }: { projectId: string }) {
  const { documents, showingTrash, loading, error, load, trash, restore } = useDocuments(projectId);
  const { projects } = useProjects();
  const project = projects.find(p => p.id === projectId);

  return (
    <section>
      <div className="text-sm mb-2">
        <Link to="/" className="text-neutral-500 hover:underline">
          Projects
        </Link>{" "}
        / <span>{project?.name ?? projectId}</span>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold">{showingTrash ? "Trashed documents" : "Documents"}</h2>
        <button className={`${btn} ml-auto`} onClick={() => void load({ trashed: !showingTrash })}>
          {showingTrash ? "Back to documents" : "Show trash"}
        </button>
      </div>
      {!showingTrash && <NewDocumentForm projectId={projectId} />}
      <ImportScript projectId={projectId}>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {loading && documents.length === 0 && <p className="text-sm text-neutral-500">Loading...</p>}
        {!loading && documents.length === 0 && <p className="text-sm text-neutral-500">{showingTrash ? "Trash is empty." : "No documents yet."}</p>}
        <ul className="space-y-2">
          {documents.map(d => (
            <li key={d.id} className="bg-white border border-neutral-200 rounded px-4 py-3 flex items-center gap-3" data-testid="document-row">
              {showingTrash ? (
                <span className="font-medium">{d.title}</span>
              ) : (
                <Link to={`/d/${d.id}`} className="font-medium hover:underline">
                  {d.title}
                </Link>
              )}
              <span className="text-xs text-neutral-500">
                {d.kind} - {d.wordCount} words - edited {new Date(d.lastEditedAt ?? d.updatedAt).toLocaleString()}
              </span>
              <button className={`${btn} ml-auto`} onClick={() => void (showingTrash ? restore(d.id) : trash(d.id))}>
                {showingTrash ? "Restore" : "Trash"}
              </button>
            </li>
          ))}
        </ul>
      </ImportScript>
    </section>
  );
}

function NewDocumentForm({ projectId }: { projectId: string }) {
  const { create } = useDocuments(projectId);
  const { templates } = useTemplates();
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
        navigate(`/d/${doc.id}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-neutral-200 rounded p-3 mb-4 flex flex-wrap gap-2 items-end" aria-label="New document">
      <label className="flex flex-col text-xs text-neutral-500 flex-1 min-w-40">
        Title
        <input
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled screenplay"
          className="border border-neutral-300 rounded px-3 py-1.5 text-base text-neutral-900"
        />
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        Kind
        <select value={kind} onChange={e => setKind(e.target.value as DocumentKind)} className="border border-neutral-300 rounded px-2 py-2 text-sm text-neutral-900">
          {DOCUMENT_KINDS.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        Template
        <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="border border-neutral-300 rounded px-2 py-2 text-sm text-neutral-900">
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy} className={primary}>
        Create document
      </button>
    </form>
  );
}
