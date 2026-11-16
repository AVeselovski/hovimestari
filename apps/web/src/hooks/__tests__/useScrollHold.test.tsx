import { installResizeObserver, resize, setLayout } from "@/__tests__/helpers/resizeObserver";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useScrollHold } from "../useScrollHold";

function Scroller({ enabled = true }: { enabled?: boolean }) {
  const ref = useScrollHold(enabled);
  return (
    <div data-testid="body" ref={ref}>
      <div data-testid="content" data-scroll-hold-content="" />
      <div data-testid="reserve" data-scroll-hold-reserve="" />
    </div>
  );
}

// jsdom has no layout. This models the one rule that matters here: a
// container's scrollHeight is its content plus the reserve, and its
// scrollTop can never pass scrollHeight - clientHeight, as in a browser.
function setup(enabled = true) {
  render(<Scroller enabled={enabled} />);
  const body = screen.getByTestId("body");
  const content = screen.getByTestId("content");
  const reserve = screen.getByTestId("reserve");
  const layout = { content: 1200, client: 600, top: 0 };
  const reserveHeight = () => parseFloat(reserve.style.height || "0");
  const maxTop = () => Math.max(0, layout.content + reserveHeight() - layout.client);
  Object.defineProperty(body, "scrollHeight", { configurable: true, get: () => layout.content + reserveHeight() });
  setLayout(body, { clientHeight: layout.client });
  Object.defineProperty(body, "scrollTop", {
    configurable: true,
    get: () => Math.min(layout.top, maxTop()),
    set: (v: number) => {
      layout.top = Math.max(0, Math.min(v, maxTop()));
    },
  });
  Object.defineProperty(content, "offsetHeight", { configurable: true, get: () => layout.content });
  // The browser reports every observed element once when observing starts.
  act(() => resize(content));
  /** The user scrolls to `top`. */
  const scrollTo = (top: number) => {
    body.scrollTop = top;
    fireEvent.scroll(body);
  };
  /** The content changes height; the browser clamps the scroll at once. */
  const setContent = (height: number) => {
    layout.content = height;
    layout.top = Math.min(layout.top, maxTop());
  };
  return { body, content, reserve, reserveHeight, scrollTo, setContent };
}

describe("useScrollHold", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = installResizeObserver();
  });
  afterEach(() => restore());

  it("scrolled to the end, a field that goes away moves nothing above it", () => {
    const { body, content, reserveHeight, scrollTo, setContent } = setup();
    scrollTo(600);
    expect(body.scrollTop).toBe(600);

    setContent(1096); // a 104px field went
    act(() => resize(content));

    expect(body.scrollTop).toBe(600);
    expect(reserveHeight()).toBe(104);
  });

  it("the same, when the browser's pull-back scroll event lands before the resize", () => {
    const { body, content, reserveHeight, scrollTo, setContent } = setup();
    scrollTo(600);
    setContent(1096);
    fireEvent.scroll(body);
    expect(body.scrollTop).toBe(600);
    expect(reserveHeight()).toBe(104);
    act(() => resize(content));
    expect(body.scrollTop).toBe(600);
  });

  // Across states: after each scroll step the view has moved by exactly the
  // distance scrolled, so taking the reserve back moves nothing on its own.
  it("gives the reserve back as the reader scrolls up, by exactly what leaves the view", () => {
    const { body, content, reserveHeight, scrollTo, setContent } = setup();
    scrollTo(600);
    setContent(1096);
    act(() => resize(content));

    scrollTo(560);
    expect(body.scrollTop).toBe(560);
    expect(reserveHeight()).toBe(64);
    scrollTo(400);
    expect(body.scrollTop).toBe(400);
    expect(reserveHeight()).toBe(0);
    scrollTo(600);
    expect(body.scrollTop).toBe(496);
  });

  it("content that grows takes the reserve's place first", () => {
    const { content, reserveHeight, scrollTo, setContent } = setup();
    scrollTo(600);
    setContent(1096);
    act(() => resize(content));
    setContent(1150);
    act(() => resize(content));
    expect(reserveHeight()).toBe(50);
    setContent(1300);
    act(() => resize(content));
    expect(reserveHeight()).toBe(0);
  });

  it("not scrolled, a shrink reserves nothing", () => {
    const { content, reserveHeight, setContent } = setup();
    setContent(1000);
    act(() => resize(content));
    expect(reserveHeight()).toBe(0);
  });

  it("does nothing while off", () => {
    const { body, content, reserveHeight, scrollTo, setContent } = setup(false);
    scrollTo(600);
    setContent(1096);
    act(() => resize(content));
    expect(reserveHeight()).toBe(0);
    expect(body.scrollTop).toBe(496);
  });
});
