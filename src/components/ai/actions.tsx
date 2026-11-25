import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import { REVIEW_KINDS, type ReviewKind, type SceneSummaryStatus } from "@sudobility/screenwriter_types";
import { checkSceneReview } from "../../util/review-scope";
import { GenerateScriptSection } from "../GenerateScriptSection";
import { SmartPasteSection } from "../SmartPasteSection";
import { LoglineSynopsisSection } from "../LoglineSynopsisSection";
import { TensionCurveSection } from "../TensionCurveSection";
import { ScriptBreakdownSection } from "../ScriptBreakdownSection";
import { RevisionSummarySection } from "../RevisionSummarySection";
import { AssistantSection } from "../AssistantSection";
import { AgentActSection } from "../AgentActSection";
import { ToneSection } from "../ToneSection";
import { AlternatesSection } from "../AlternatesSection";
import { PolishSceneSection } from "../PolishSceneSection";
import { StoryboardSection } from "../StoryboardSection";
import { primary, Progress, ReportView, SuggestionReview, type AiWizardCtx } from "./shared";

export type AiGroup = "generate" | "review" | "polish" | "analyze" | "assistant";

export const GROUP_LABEL: Record<AiGroup, string> = {
  generate: "Generate",
  review: "Review",
  polish: "Polish",
  analyze: "Analyze",
  assistant: "Assistant",
};

export const GROUP_ORDER: AiGroup[] = ["generate", "review", "polish", "analyze", "assistant"];

export interface AiAction {
  id: string;
  group: AiGroup;
  title: string;
  blurb: string;
  keywords?: string[];
  /** The options screen body for this action. */
  Options: (props: { ctx: AiWizardCtx }) => ReactNode;
}

// ---------------------------------------------------------------------------
// Custom actions (ported from the old inline AiPanel logic). Each of these runs on its own screen —
// reached from the list — and shows progress + results inline below the execute button, so the
// first-use consent prompt and a re-run stay on the same screen.
// ---------------------------------------------------------------------------

function CoverageReviewOptions({ ctx }: { ctx: AiWizardCtx }) {
  const { ai, host, documentId, scene } = ctx;
  const sw = useScreenwriter();
  const [reviewScope, setReviewScope] = useState<"script" | "scene">("script");
  const [summaries, setSummaries] = useState<SceneSummaryStatus[] | null>(null);
  const jobStatus = ai.job?.status;
  useEffect(() => {
    let on = true;
    sw.client
      .listSceneSummaries(documentId)
      .then(r => on && setSummaries(r.scenes))
      .catch(() => on && setSummaries([]));
    return () => {
      on = false;
    };
  }, [sw, documentId, jobStatus]);

  const allScenes = host.model.scenes().map(s => ({ id: String(s.id), heading: s.headingText }));
  const sceneCheck = checkSceneReview(allScenes, scene?.id, summaries);
  const sceneScope = reviewScope === "scene";
  const canReview = !sceneScope || (!!scene && sceneCheck.allowed);
  const job = ai.job;
  const activeTask = job?.status === "queued" || job?.status === "running" ? job?.task : null;
  const startReview = () => void (sceneScope && scene ? ai.startReview(undefined, { sceneIds: [scene.id], storySoFar: true }) : ai.startReview());

  return (
    <section className="space-y-2" data-testid="ai-review-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Review</h3>
      <p className="text-xs text-neutral-600">Coverage notes: summary, strengths, weaknesses and notes by scene.</p>
      <label className="flex flex-col text-xs text-neutral-500 gap-1">
        What to review
        <Select value={reviewScope} onValueChange={v => setReviewScope(v as "script" | "scene")} disabled={ai.busy}>
          <SelectTrigger aria-label="What to review" data-testid="ai-review-scope" className="w-full bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="script">Complete script</SelectItem>
            <SelectItem value="scene" disabled={!scene || !sceneCheck.allowed} data-testid="ai-review-scope-scene">
              Current scene
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      <p className="text-xs text-neutral-600" data-testid="ai-review-scope-note" data-scene-allowed={!!scene && sceneCheck.allowed}>
        {!scene ? (
          <>To review one scene, click in it in the script first.</>
        ) : sceneCheck.allowed ? (
          sceneScope ? (
            <>
              Reviews <strong>{scene.heading || "(untitled scene)"}</strong> in full
              {sceneCheck.before > 0 ? `, with the ${sceneCheck.before} scene${sceneCheck.before === 1 ? "" : "s"} before it as summaries` : " (it is the first scene)"}. Costs far fewer credits than the
              complete script.
              {sceneCheck.outdated > 0 &&
                ` ${sceneCheck.outdated} of those summaries ${sceneCheck.outdated === 1 ? "is" : "are"} from before the scene was last changed; a review of the complete script refreshes them.`}
            </>
          ) : (
            <>
              Current scene: <strong>{scene.heading || "(untitled scene)"}</strong> can also be reviewed on its own.
            </>
          )
        ) : summaries === null ? (
          <>Checking which scenes have a summary...</>
        ) : (
          <>
            <strong>{scene.heading || "(untitled scene)"}</strong> cannot be reviewed on its own yet: {sceneCheck.missing.length} of the {sceneCheck.before} scene
            {sceneCheck.before === 1 ? "" : "s"} before it {sceneCheck.missing.length === 1 ? "has" : "have"} no summary (first: scene {sceneCheck.missing[0]?.position},{" "}
            {sceneCheck.missing[0]?.heading || "untitled"}). Review the complete script once; that summarises every scene.
          </>
        )}
      </p>
      <button className={primary} disabled={ai.busy || !canReview} onClick={startReview} data-testid="ai-review-button">
        {sceneScope ? "Review this scene" : "Review this script"}
      </button>
      {activeTask === "coverage" && <Progress ai={ai} />}
      {job?.task === "coverage" && job.status === "cancelled" && <p className="text-xs text-neutral-500">Review cancelled.</p>}
      {ai.report && <ReportView report={ai.report} createdAt={ai.reportCreatedAt} host={host} onJumpTo={ctx.onJumpTo} />}
    </section>
  );
}

function FocusedReviewOptions({ ctx }: { ctx: AiWizardCtx }) {
  const { ai, scene } = ctx;
  const [reviewKind, setReviewKind] = useState<ReviewKind>("character");
  const [focusScene, setFocusScene] = useState(false);
  const usable = ai.status?.available === true;
  const job = ai.job;
  const activeTask = job?.status === "queued" || job?.status === "running" ? job?.task : null;
  const startFocused = () => void ai.startFocusedReview(reviewKind, focusScene && scene ? { sceneIds: [scene.id] } : undefined);

  return (
    <section className="space-y-2" data-testid="ai-focused-review-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Focused review</h3>
      <p className="text-xs text-neutral-600">A targeted pass that files its findings as pending comments to triage in the Comments panel.</p>
      <label className="flex flex-col text-xs text-neutral-500 gap-1">
        Review kind
        <Select value={reviewKind} onValueChange={v => setReviewKind(v as ReviewKind)} disabled={ai.busy}>
          <SelectTrigger aria-label="Review kind" data-testid="ai-review-kind" className="w-full bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEW_KINDS.map(k => (
              <SelectItem key={k} value={k} data-testid={`ai-review-kind-${k}`}>
                {k.charAt(0).toUpperCase() + k.slice(1).replace("-", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {scene && (
        <label className="flex items-center gap-1 text-xs text-neutral-600">
          <input type="checkbox" checked={focusScene} onChange={e => setFocusScene(e.target.checked)} disabled={ai.busy} /> Only the current scene
        </label>
      )}
      <button className={primary} disabled={ai.busy || !usable} onClick={startFocused} data-testid="ai-focused-review-button">
        Run {reviewKind.replace("-", " ")} review
      </button>
      {activeTask === "review" && <Progress ai={ai} />}
      {job?.task === "review" && job.status === "cancelled" && <p className="text-xs text-neutral-500">Review cancelled.</p>}
      {ai.reviewResult && (
        <div className="rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="ai-focused-review-result">
          <p className="font-medium">
            {ai.reviewResult.count === 0
              ? "No issues found — nothing to comment on."
              : `Added ${ai.reviewResult.count} comment${ai.reviewResult.count === 1 ? "" : "s"} (${ai.reviewResult.reviewKind}). Open the Comments panel to triage them.`}
          </p>
          {ai.reviewResult.summary && <p className="mt-1 whitespace-pre-wrap text-neutral-600">{ai.reviewResult.summary}</p>}
          {ai.reviewResult.verdict && <p className="mt-1 text-neutral-500">Verdict: {ai.reviewResult.verdict}{ai.reviewResult.verdictRationale ? ` — ${ai.reviewResult.verdictRationale}` : ""}</p>}
        </div>
      )}
    </section>
  );
}

function PolishOptions({ ctx }: { ctx: AiWizardCtx }) {
  const { ai, scene } = ctx;
  const job = ai.job;
  const activeTask = job?.status === "queued" || job?.status === "running" ? job?.task : null;
  const startPolish = () => scene && void ai.startPolish({ sceneIds: [scene.id] });
  return (
    <section className="space-y-2" data-testid="ai-polish-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Polish</h3>
      <p className="text-xs text-neutral-600">Tighter dialogue, as suggestions you accept or reject one by one. Nothing changes until you accept.</p>
      <p className="text-sm" data-testid="ai-polish-scope">
        Scope: <strong>Current scene</strong>
        {scene ? <>: {scene.heading || "(untitled scene)"}</> : <span className="text-neutral-500"> (click in the script to choose a scene)</span>}
      </p>
      <button className={primary} disabled={ai.busy || !scene} onClick={startPolish} data-testid="ai-polish-button">
        Polish dialogue
      </button>
      {activeTask === "polish.dialogue" && <Progress ai={ai} />}
      {job?.task === "polish.dialogue" && job.status === "cancelled" && <p className="text-xs text-neutral-500">Polish cancelled.</p>}
      {ai.polishFoundNothing && <p className="text-xs text-neutral-600">The AI found nothing worth changing in that scene.</p>}
      <SuggestionReview ctx={ctx} onRerun={startPolish} canRerun={!!scene} />
    </section>
  );
}

function TrimOptions({ ctx }: { ctx: AiWizardCtx }) {
  const { ai, scene } = ctx;
  const usable = ai.status?.available === true;
  const job = ai.job;
  const activeTask = job?.status === "queued" || job?.status === "running" ? job?.task : null;
  const startTrim = () => void ai.startTrim(scene ? { sceneIds: [scene.id] } : undefined);
  return (
    <section className="space-y-2" data-testid="ai-trim-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Trim for length</h3>
      <p className="text-xs text-neutral-600">Shorter versions of lines{scene ? " in the current scene" : " across the whole script"}, to cut page count. Review and accept each, like polish.</p>
      <button className={primary} data-testid="ai-trim-button" disabled={ai.busy || !usable} onClick={startTrim}>
        {scene ? "Trim the current scene" : "Trim the script"}
      </button>
      {activeTask === "trim" && <Progress ai={ai} />}
      {job?.task === "trim" && job.status === "cancelled" && <p className="text-xs text-neutral-500">Trim cancelled.</p>}
      <SuggestionReview ctx={ctx} onRerun={startTrim} canRerun={usable} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// The registry. Self-contained sections are rendered as-is; the four above are custom.
// ---------------------------------------------------------------------------

export const AI_ACTIONS: AiAction[] = [
  {
    id: "generate",
    group: "generate",
    title: "Generate script",
    blurb: "Write a draft script from a story you describe.",
    keywords: ["write", "draft", "create", "story"],
    Options: ({ ctx }) => <GenerateScriptSection host={ctx.host} onInserted={ctx.onJumpTo} />,
  },
  {
    id: "storyboard",
    group: "generate",
    title: "Generate storyboard",
    blurb: "Turn the current scene into line-art storyboard frames.",
    keywords: ["storyboard", "frames", "shots", "line art", "images", "visual", "scene"],
    Options: ({ ctx }) => <StoryboardSection host={ctx.host} documentId={ctx.documentId} scene={ctx.scene} />,
  },
  {
    id: "smart-paste",
    group: "generate",
    title: "Smart paste",
    blurb: "Turn pasted text into characters, a formatted script, or plots.",
    keywords: ["paste", "import", "clipboard", "characters", "plots"],
    Options: ({ ctx }) => <SmartPasteSection host={ctx.host} scene={ctx.scene} onInserted={ctx.onJumpTo} />,
  },
  {
    id: "review",
    group: "review",
    title: "Coverage review",
    blurb: "Summary, strengths, weaknesses and notes by scene.",
    keywords: ["coverage", "notes", "feedback", "verdict"],
    Options: CoverageReviewOptions,
  },
  {
    id: "focused-review",
    group: "review",
    title: "Focused review",
    blurb: "A targeted pass (character, pacing, visual…) filed as comments.",
    keywords: ["character", "pacing", "visual", "continuity", "loose end", "comments"],
    Options: FocusedReviewOptions,
  },
  {
    id: "breakdown",
    group: "review",
    title: "Script breakdown",
    blurb: "Production elements (props, cast, locations…) by scene.",
    keywords: ["production", "props", "cast", "elements"],
    Options: ({ ctx }) => <ScriptBreakdownSection host={ctx.host} onJumpTo={ctx.onJumpTo} />,
  },
  {
    id: "tension",
    group: "review",
    title: "Tension curve",
    blurb: "Plot the dramatic tension across the scenes and spot sags.",
    keywords: ["pacing", "curve", "drama", "structure"],
    Options: ({ ctx }) => <TensionCurveSection host={ctx.host} onJumpTo={ctx.onJumpTo} />,
  },
  {
    id: "polish",
    group: "polish",
    title: "Polish dialogue",
    blurb: "Tighter dialogue in the current scene, accepted one by one.",
    keywords: ["dialogue", "tighten", "suggestions"],
    Options: PolishOptions,
  },
  {
    id: "trim",
    group: "polish",
    title: "Trim for length",
    blurb: "Shorter versions of lines to cut page count.",
    keywords: ["shorten", "cut", "length", "pages"],
    Options: TrimOptions,
  },
  {
    id: "polish-scene",
    group: "polish",
    title: "Polish scene",
    blurb: "Rework the current scene using the characters' skeletons.",
    keywords: ["scene", "rewrite", "skeleton"],
    Options: ({ ctx }) => <PolishSceneSection host={ctx.host} scene={ctx.scene} />,
  },
  {
    id: "tone",
    group: "polish",
    title: "Tone",
    blurb: "Shift the tone of a scene (darker, lighter, funnier…).",
    keywords: ["mood", "style", "voice"],
    Options: ({ ctx }) => <ToneSection host={ctx.host} sceneId={ctx.scene?.id} onJumpTo={ctx.onJumpTo} />,
  },
  {
    id: "alternates",
    group: "polish",
    title: "Alternate lines",
    blurb: "Offer alternate takes on a selected line of dialogue.",
    keywords: ["variations", "options", "line", "dialogue"],
    Options: ({ ctx }) => <AlternatesSection host={ctx.host} onJumpTo={ctx.onJumpTo} />,
  },
  {
    id: "logline",
    group: "analyze",
    title: "Logline & synopsis",
    blurb: "Turn the script into a logline, synopsis and treatment.",
    keywords: ["pitch", "summary", "treatment"],
    Options: ({ ctx }) => <LoglineSynopsisSection host={ctx.host} />,
  },
  {
    id: "revision",
    group: "analyze",
    title: "Revision summary",
    blurb: "Summarize what changed since the last revision.",
    keywords: ["changes", "diff", "history"],
    Options: ({ ctx }) => <RevisionSummarySection documentId={ctx.documentId} host={ctx.host} />,
  },
  {
    id: "assistant",
    group: "assistant",
    title: "Assistant",
    blurb: "Ask the AI about the script in your own words.",
    keywords: ["chat", "ask", "question", "help"],
    Options: ({ ctx }) => <AssistantSection host={ctx.host} onJumpTo={ctx.onJumpTo} />,
  },
  {
    id: "agent",
    group: "assistant",
    title: "Agent act",
    blurb: "Let the AI take multi-step actions on the script.",
    keywords: ["automate", "steps", "act", "tasks"],
    Options: ({ ctx }) => <AgentActSection host={ctx.host} onJumpTo={ctx.onJumpTo} />,
  },
];

export function actionById(id: string): AiAction | undefined {
  return AI_ACTIONS.find(a => a.id === id);
}

/** Filter + group the actions for the list screen. */
export function useFilteredGroups(query: string): { group: AiGroup; actions: AiAction[] }[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (a: AiAction) =>
      !q || a.title.toLowerCase().includes(q) || a.blurb.toLowerCase().includes(q) || (a.keywords ?? []).some(k => k.includes(q)) || GROUP_LABEL[a.group].toLowerCase().includes(q);
    return GROUP_ORDER.map(group => ({ group, actions: AI_ACTIONS.filter(a => a.group === group && match(a)) })).filter(g => g.actions.length > 0);
  }, [query]);
}
