// Keeps in-page translation from crashing the app.
//
// Chrome's built-in translate (and the Google Translate widget it shares code
// with) rewrites the page by wrapping each text node it translates in
// `<font>` elements, moving the original node out from under its parent.
// React still holds a reference to the original node and still believes it is
// a direct child, so the next commit that removes or inserts next to it calls
// `removeChild` / `insertBefore` on a parent that no longer contains it, and
// the DOM throws "NotFoundError: Failed to execute 'removeChild' on 'Node':
// The node to be removed is not a child of this node." That throw happens
// during React's commit phase, nothing can catch it below the root, and the
// visitor lands on global-error.tsx's "Something went wrong" screen.
//
// First instance: Sentry issue 7800203742, Chrome Mobile on Android with a
// French locale, captured by global-error.tsx right after the /login ->
// /profile hop (breadcrumbs show clicks on `font > font`, the translator's
// wrappers). Same translator tell as CREDITODDS-JAVASCRIPT-NEXTJS-18 in
// benignClientError.ts. Upstream: https://github.com/facebook/react/issues/11538
//
// The guard only changes the two calls that are about to throw anyway, and
// everything else goes straight to the native method:
// - removeChild of a node that is no longer a direct child: if it still sits
//   somewhere inside this parent (moved under a wrapper), remove it from where
//   it actually is; if the translator already detached it, there is nothing
//   left to remove.
// - insertBefore a reference node that is no longer a direct child: insert
//   before the direct child that now contains it (the wrapper), so order is
//   kept; if the reference was detached, append rather than drop React's new
//   node, which would leave content missing.
// Tradeoff: translated text React meant to replace can linger next to the new
// text, but the page stays up and a reload fixes it. Opting the site
// out of translation (`translate="no"`) would avoid the crash only by removing
// translation for exactly the visitors who need it.

interface PatchableNodePrototype {
  removeChild: (child: Node) => Node;
  insertBefore: (node: Node, child: Node | null) => Node;
}

const GUARD_MARK = '__creditoddsTranslateGuard';

export function installTranslatedDomGuard(proto: PatchableNodePrototype): void {
  const marked = proto as PatchableNodePrototype & { [GUARD_MARK]?: true };
  if (marked[GUARD_MARK]) return;
  marked[GUARD_MARK] = true;

  const originalRemoveChild = proto.removeChild;
  proto.removeChild = function removeChild(this: Node, child: Node) {
    if (child.parentNode !== this) {
      const actualParent = child.parentNode;
      if (actualParent && this.contains(child)) {
        return actualParent.removeChild(child);
      }
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = proto.insertBefore;
  proto.insertBefore = function insertBefore(
    this: Node,
    node: Node,
    child: Node | null,
  ) {
    if (child && child.parentNode !== this) {
      let anchor: Node | null = child;
      while (anchor && anchor.parentNode !== this) {
        anchor = anchor.parentNode;
      }
      return originalInsertBefore.call(this, node, anchor);
    }
    return originalInsertBefore.call(this, node, child);
  };
}
