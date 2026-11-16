import { installResizeObserver, resize, setLayout } from "@/__tests__/helpers/resizeObserver";
import { act, render, screen } from "@testing-library/react";
import { useAnchoredPanel } from "../useAnchoredPanel";

function Panel({ enabled }: { enabled: boolean }) {
  const { panelRef, pinned, style } = useAnchoredPanel(enabled);
  return (
    <div data-testid="viewport" data-pinned={pinned || undefined} style={{ padding: "16px" }}>
      <div data-testid="panel" ref={panelRef} style={style} />
    </div>
  );
}

// An 800px viewport with 16px padding, and a 200px panel the centring put
// at 300px from its top.
function setup(enabled = true) {
  const utils = render(<Panel enabled={enabled} />);
  const viewport = screen.getByTestId("viewport");
  const panel = screen.getByTestId("panel");
  setLayout(viewport, { clientHeight: 800 });
  setLayout(panel, { offsetTop: 300, offsetHeight: 200 });
  return { ...utils, viewport, panel };
}

/** Where the panel's top now is, as the pinned layout puts it. */
function topOf(viewport: HTMLElement, panel: HTMLElement) {
  return viewport.dataset.pinned ? 16 + parseFloat(panel.style.marginTop) : 300;
}

describe("useAnchoredPanel", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = installResizeObserver();
  });
  afterEach(() => restore());

  it("pins the panel where the centring put it, which paints the same place", () => {
    const { viewport, panel } = setup();
    expect(viewport).not.toHaveAttribute("data-pinned");
    act(() => resize(panel, viewport));
    expect(viewport).toHaveAttribute("data-pinned");
    expect(panel.style.marginTop).toBe("284px");
    expect(topOf(viewport, panel)).toBe(300);
  });

  // The across-state property: the top in each state equals the top in the
  // state before it, through an error appearing and going again.
  it("keeps its top through a grow and a shrink, and never gets shorter", () => {
    const { viewport, panel } = setup();
    act(() => resize(panel, viewport));
    const opened = topOf(viewport, panel);

    setLayout(panel, { offsetTop: 300, offsetHeight: 224 });
    act(() => resize(panel));
    expect(topOf(viewport, panel)).toBe(opened);
    expect(panel.style.minHeight).toBe("224px");

    setLayout(panel, { offsetTop: 300, offsetHeight: 200 });
    act(() => resize(panel));
    expect(topOf(viewport, panel)).toBe(opened);
    expect(panel.style.minHeight).toBe("224px");
  });

  it("moves up just enough to keep a grown panel inside the viewport, never past its padding", () => {
    const { viewport, panel } = setup();
    act(() => resize(panel, viewport));

    setLayout(panel, { offsetTop: 300, offsetHeight: 600 });
    act(() => resize(panel));
    expect(topOf(viewport, panel)).toBe(800 - 16 - 600);

    setLayout(panel, { offsetTop: 184, offsetHeight: 900 });
    act(() => resize(panel));
    expect(topOf(viewport, panel)).toBe(16);
  });

  it("lets go when the viewport itself is resized, so the panel is centred again", () => {
    const { viewport, panel } = setup();
    act(() => resize(panel, viewport));
    setLayout(viewport, { clientHeight: 600 });
    act(() => resize(viewport));
    expect(viewport).not.toHaveAttribute("data-pinned");
    // jsdom's style object keeps a removed margin-top, which a browser does
    // not, so the least height stands for both properties here.
    expect(panel.style.minHeight).toBe("");
  });

  it("does nothing while off, and forgets the pin when turned off", () => {
    const { viewport, panel, rerender } = setup(false);
    act(() => resize(panel, viewport));
    expect(viewport).not.toHaveAttribute("data-pinned");

    rerender(<Panel enabled />);
    act(() => resize(panel, viewport));
    expect(viewport).toHaveAttribute("data-pinned");
    rerender(<Panel enabled={false} />);
    expect(viewport).not.toHaveAttribute("data-pinned");
    expect(panel.style.minHeight).toBe("");
  });
});
