import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mapViewMock = vi.fn();

vi.mock("./components/MapView", () => ({
  default: (props: {
    center: [number, number];
    compareCenter: [number, number] | null;
    focusCenter: [number, number];
    isLoading: boolean;
    radiusKm: number;
    onSelect: (value: [number, number]) => void;
  }) => {
    mapViewMock(props);
    return (
      <div data-testid="map-view">
        <button onClick={() => props.onSelect([37.8, -122.27])} type="button">
          Mock primary map click
        </button>
        <span data-testid="map-radius">{props.radiusKm}</span>
        <span data-testid="map-center">
          {props.center[0].toFixed(4)},{props.center[1].toFixed(4)}
        </span>
        <span data-testid="map-focus">
          {props.focusCenter[0].toFixed(4)},{props.focusCenter[1].toFixed(4)}
        </span>
        <span data-testid="map-compare-center">
          {props.compareCenter
            ? `${props.compareCenter[0].toFixed(4)},${props.compareCenter[1].toFixed(4)}`
            : "none"}
        </span>
        <span data-testid="map-loading">{String(props.isLoading)}</span>
      </div>
    );
  },
}));

describe("App", () => {
  beforeEach(() => {
    mapViewMock.mockClear();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:mock-report"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("loads the default summary on first render", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
            locationName: "Near Montgomery St Station",
          }),
        ),
      );

    render(<App />);

    expect(await screen.findByText("541,797")).toBeInTheDocument();
    expect(screen.getByText("3,428")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/summary?lat=37.7749&lon=-122.4194&radiusKm=5",
    );
  });

  it("refetches when the radius slider changes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
            locationName: "Near Montgomery St Station",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 904658,
            busStops: 6076,
            tramStops: 1089,
            trainMetroStops: 93,
            locationName: "Near Montgomery St Station",
          }),
        ),
      );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.change(screen.getByLabelText("Radius: 5 km"), {
      target: { value: "10" },
    });

    await screen.findByText("904,658");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/summary?lat=37.7749&lon=-122.4194&radiusKm=10",
    );
    expect(screen.getAllByText("Radius: 10 km").length).toBeGreaterThan(0);
    expect(screen.getByTestId("map-radius")).toHaveTextContent("10");
    expect(window.location.search).toContain("radiusKm=10");
  });

  it("refetches when the primary map selection changes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
            locationName: "Near Montgomery St Station",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 211234,
            busStops: 1098,
            tramStops: 124,
            trainMetroStops: 19,
            locationName: "Near Emeryville Station",
          }),
        ),
      );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.click(screen.getByRole("button", { name: "Mock primary map click" }));

    await screen.findByText("211,234");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/summary?lat=37.8&lon=-122.27&radiusKm=5",
    );
    await waitFor(() => {
      expect(screen.getByText(/37\.8000, -122\.2700/)).toBeVisible();
    });
  });

  it("hydrates from URL state and loads compare mode", async () => {
    window.history.replaceState(
      null,
      "",
      "/?lat=37.78&lon=-122.42&radiusKm=8&compare=1&compareLat=37.8&compareLon=-122.27",
    );

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 600000,
            busStops: 3500,
            tramStops: 720,
            trainMetroStops: 61,
            locationName: "Near Powell St Station",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 220000,
            busStops: 1200,
            tramStops: 130,
            trainMetroStops: 20,
            locationName: "Near Emeryville Station",
          }),
        ),
      );

    render(<App />);

    expect(await screen.findByText("600,000")).toBeInTheDocument();
    expect(await screen.findByText("220,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare mode" })).toHaveClass("is-active");
    expect(screen.getByText(/37\.7800, -122\.4200/)).toBeVisible();
    expect(screen.getByText(/37\.8000, -122\.2700/)).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/summary?lat=37.78&lon=-122.42&radiusKm=8",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/summary?lat=37.8&lon=-122.27&radiusKm=8",
    );
    expect(screen.getByTestId("map-compare-center")).toHaveTextContent("37.8000,-122.2700");
  });

  it("falls back to single point when compare coordinates are invalid", async () => {
    window.history.replaceState(
      null,
      "",
      "/?lat=0.000000&lon=0.000000&radiusKm=3&compare=1&compareLat=0.000000&compareLon=0.000000",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          estimatedPopulation: 541797,
          busStops: 3428,
          tramStops: 740,
          trainMetroStops: 63,
          locationName: "Near Montgomery St Station",
        }),
      ),
    );

    render(<App />);

    expect(await screen.findByText("541,797")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Single point" })).toHaveClass("is-active");
    expect(screen.getByTestId("map-center")).toHaveTextContent("37.7749,-122.4194");
    expect(screen.getByTestId("map-compare-center")).toHaveTextContent("none");
    expect(window.location.search).toBe("?lat=37.774900&lon=-122.419400&radiusKm=3");
  });

  it("places a compare point and shows delta badges", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
            locationName: "Near Montgomery St Station",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 541797,
            busStops: 3428,
            tramStops: 740,
            trainMetroStops: 63,
            locationName: "Near Montgomery St Station",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            estimatedPopulation: 210000,
            busStops: 1100,
            tramStops: 100,
            trainMetroStops: 20,
            locationName: "Near Emeryville Station",
          }),
        ),
      );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.click(screen.getByRole("button", { name: "Compare mode" }));
    fireEvent.click(screen.getByRole("button", { name: /set compare point/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mock primary map click" }));

    expect(await screen.findByText("210,000")).toBeInTheDocument();
    expect(screen.getAllByText(/Delta -/).length).toBeGreaterThan(0);
  });

  it("downloads a report pdf", async () => {
    const originalCreateElement = document.createElement.bind(document);
    const clickMock = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") {
        return {
          click: clickMock,
          remove: vi.fn(),
          set href(_value: string) {},
          set download(_value: string) {},
        } as unknown as HTMLAnchorElement;
      }

      return originalCreateElement(tagName);
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          estimatedPopulation: 541797,
          busStops: 3428,
          tramStops: 740,
          trainMetroStops: 63,
          locationName: "Near Montgomery St Station",
        }),
      ),
    );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.click(screen.getByRole("button", { name: "Download report" }));

    await waitFor(() => {
      expect(clickMock).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "Report downloaded" })).toBeInTheDocument();
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
  });

  it("copies the shareable link", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          estimatedPopulation: 541797,
          busStops: 3428,
          tramStops: 740,
          trainMetroStops: 63,
          locationName: "Near Montgomery St Station",
        }),
      ),
    );

    render(<App />);
    await screen.findByText("541,797");

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("http://localhost/?lat=37.774900&lon=-122.419400&radiusKm=5");
    });
    expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));

    render(<App />);

    expect(
      await screen.findByText("Request failed with status 500"),
    ).toBeInTheDocument();
  });
});
