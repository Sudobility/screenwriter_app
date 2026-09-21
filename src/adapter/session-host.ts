import type { DocumentSession } from "@sudobility/screenwriter_lib";
import type { ScriptEditorHost } from "@sudobility/writing_ui";

/**
 * Adapter from the lib's `DocumentSession` to `writing_ui`'s `ScriptEditorHost`.
 *
 * The shapes were designed to match, so this is a pure forwarder; it exists so the editor never sees the
 * session's other members (snapshots, flush, close) and so a mismatch has one place to be fixed. Every member is
 * forwarded lazily (getters read the session each time): after a rebase `session.model` is a NEW object and the
 * editor must re-read `host.model`, which it does on the `subscribe(null)` notification.
 *
 * Known mismatches: none at the type level. `RemoteCursor` (lib) and `RemoteCursorInfo` (ui) are structurally
 * identical; the lib's generic `on(event, fn)` is narrowed to the `presence` overload the editor uses.
 */
export function sessionToHost(session: DocumentSession): ScriptEditorHost {
  return {
    get model() {
      return session.model;
    },
    get remoteCursors() {
      return session.remoteCursors;
    },
    execute: (commands, options) => session.execute(commands, options),
    undo: () => session.undo(),
    redo: () => session.redo(),
    subscribe: listener => session.subscribe(listener),
    setLocalCursor: cursor => session.setLocalCursor(cursor),
    noteCaret: id => session.noteCaret(id),
    on: (_event, fn) => session.on("presence", fn),
  };
}
