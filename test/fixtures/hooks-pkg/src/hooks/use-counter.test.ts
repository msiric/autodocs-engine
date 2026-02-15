import { renderHook, act } from "@testing-library/react-hooks";
import { useCounter } from "./use-counter";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
}));

describe("useCounter", () => {
  it("should initialize with the given value", () => {
    const { result } = renderHook(() => useCounter(5));
    expect(result.current.count).toBe(5);
  });

  it("should increment", () => {
    const { result } = renderHook(() => useCounter(0));
    act(() => result.current.increment());
    expect(result.current.count).toBe(1);
  });

  it("should decrement", () => {
    const { result } = renderHook(() => useCounter(5));
    act(() => result.current.decrement());
    expect(result.current.count).toBe(4);
  });
});
