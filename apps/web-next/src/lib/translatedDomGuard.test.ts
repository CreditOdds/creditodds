import { describe, expect, it } from "vitest";
import { installTranslatedDomGuard } from "./translatedDomGuard";

// Minimal stand-in for the DOM's Node: native removeChild/insertBefore throw
// NotFoundError when the node isn't a child, exactly like the browser.
class FakeNode {
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];

  appendChild(child: FakeNode) {
    child.parentNode?.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  contains(node: FakeNode | null): boolean {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  removeChild(child: FakeNode) {
    const i = this.children.indexOf(child);
    if (i === -1) throw new Error("NotFoundError: removeChild");
    this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(node: FakeNode, ref: FakeNode | null) {
    if (ref === null) return this.appendChild(node);
    const i = this.children.indexOf(ref);
    if (i === -1) throw new Error("NotFoundError: insertBefore");
    node.parentNode?.removeChild(node);
    this.children.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
}

class GuardedNode extends FakeNode {}
installTranslatedDomGuard(GuardedNode.prototype as never);

// Simulates Chrome translate: the text node moves inside a <font> wrapper.
function translate(parent: FakeNode, text: FakeNode) {
  const font = new GuardedNode();
  const inner = font.appendChild(new GuardedNode());
  parent.insertBefore(font, text);
  inner.appendChild(text);
  return font;
}

describe("installTranslatedDomGuard", () => {
  it("unguarded nodes throw on a translated child (the bug)", () => {
    const parent = new FakeNode();
    const text = parent.appendChild(new FakeNode());
    const font = new FakeNode();
    parent.insertBefore(font, text);
    font.appendChild(text);
    expect(() => parent.removeChild(text)).toThrow("NotFoundError");
  });

  it("removeChild of a child moved under a wrapper removes it from there", () => {
    const parent = new GuardedNode();
    const text = parent.appendChild(new GuardedNode());
    const font = translate(parent, text);
    expect(parent.removeChild(text)).toBe(text);
    expect(text.parentNode).toBeNull();
    expect(font.children).not.toContain(text);
  });

  it("removeChild of a child the translator detached is a no-op", () => {
    const parent = new GuardedNode();
    const text = parent.appendChild(new GuardedNode());
    const font = translate(parent, text);
    font.children.at(-1)!.removeChild(text);
    expect(parent.removeChild(text)).toBe(text);
  });

  it("removeChild of an unrelated node is a no-op, not a foreign removal", () => {
    const parent = new GuardedNode();
    const other = new GuardedNode();
    const stranger = other.appendChild(new GuardedNode());
    expect(parent.removeChild(stranger)).toBe(stranger);
    expect(other.children).toContain(stranger);
  });

  it("insertBefore a moved reference inserts before its wrapper", () => {
    const parent = new GuardedNode();
    const first = parent.appendChild(new GuardedNode());
    const text = parent.appendChild(new GuardedNode());
    const font = translate(parent, text);
    const added = new GuardedNode();
    expect(parent.insertBefore(added, text)).toBe(added);
    expect(parent.children).toEqual([first, added, font]);
  });

  it("insertBefore a detached reference appends instead of dropping", () => {
    const parent = new GuardedNode();
    const text = parent.appendChild(new GuardedNode());
    const font = translate(parent, text);
    font.children.at(-1)!.removeChild(text);
    const added = new GuardedNode();
    parent.insertBefore(added, text);
    expect(parent.children).toEqual([font, added]);
  });

  it("leaves normal removeChild and insertBefore untouched", () => {
    const parent = new GuardedNode();
    const a = parent.appendChild(new GuardedNode());
    const b = new GuardedNode();
    parent.insertBefore(b, a);
    expect(parent.children).toEqual([b, a]);
    parent.removeChild(a);
    expect(parent.children).toEqual([b]);
    expect(a.parentNode).toBeNull();
    const c = new GuardedNode();
    parent.insertBefore(c, null);
    expect(parent.children).toEqual([b, c]);
  });

  it("is idempotent", () => {
    class Twice extends FakeNode {}
    installTranslatedDomGuard(Twice.prototype as never);
    const once = Twice.prototype.removeChild;
    installTranslatedDomGuard(Twice.prototype as never);
    expect(Twice.prototype.removeChild).toBe(once);
  });
});
