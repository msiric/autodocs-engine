import { renderHook, act } from "@testing-library/react-hooks";
import { useToggle } from "./use-toggle";

describe("useToggle", () => {
  it("should default to false", () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current.value).toBe(false);
  });

  it("should toggle", () => {
    const { result } = renderHook(() => useToggle());
    act(() => result.current.toggle());
    expect(result.current.value).toBe(true);
  });
});
